import { useState, useEffect, useCallback } from 'react'
import LoginScreen from './components/LoginScreen.jsx'
import InboxDigest from './components/InboxDigest.jsx'
import EvalPanel from './components/EvalPanel.jsx'
import { initGoogleAuth, requestGmailAccess, getStoredToken, clearStoredToken, executeStagedChange, fetchInboxForReview, buildLabelIndex } from './lib/gmail.js'
import { classifyEmails } from './lib/anthropic.js'
import { generateStagedChanges, makeManualTrash, LABEL_RULES } from './lib/rules.js'
import * as exclusionsStore from './lib/exclusions.js'
import * as correctionsStore from './lib/corrections.js'
import { runLabelEval } from './lib/eval.js'

// ── Configuration ────────────────────────────────────────────────────────────
// Set your Google OAuth Client ID here OR enter it in the login screen
const DEFAULT_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export default function App() {
  const [clientId, setClientId] = useState(DEFAULT_CLIENT_ID)
  const [accessToken, setAccessToken] = useState(() => getStoredToken())
  const [emails, setEmails] = useState([])
  // baseClassifications = raw classifier output; classifications = base with user
  // corrections (moves + learned sender rules) applied. Keeping base separate lets
  // "undo a correction" re-derive without re-fetching/re-classifying.
  const [baseClassifications, setBaseClassifications] = useState(new Map())
  const [classifications, setClassifications] = useState(new Map())
  const [stagedChanges, setStagedChanges] = useState([])
  const [exclusions, setExclusions] = useState([])
  const [corrections, setCorrections] = useState([])
  const [labelIndex, setLabelIndex] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [evalState, setEvalState] = useState({ open: false, loading: false, report: null, error: null })

  // Load persisted exclusions once on mount, dropping any expired snoozes.
  useEffect(() => {
    const pruned = exclusionsStore.pruneExpired(exclusionsStore.load())
    exclusionsStore.save(pruned)
    setExclusions(pruned)
  }, [])

  // Load persisted corrections (moves + learned sender rules) once on mount.
  useEffect(() => {
    setCorrections(correctionsStore.load())
  }, [])

  // Initialize Google Auth once clientId is set
  useEffect(() => {
    if (!clientId) return
    initGoogleAuth(clientId, (token) => {
      setAccessToken(token)
    })
  }, [clientId])

  // Auto-load emails when token is available
  useEffect(() => {
    if (accessToken) {
      loadEmails(accessToken)
    }
  }, [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadEmails = useCallback(async (token) => {
    const apiKey = localStorage.getItem('anthropic_key')
    if (!apiKey) {
      setError('Anthropic API key not found. Please sign out and re-enter it.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const now = Date.now()

      // 1. Live label index first — needed to tell which mail is already filed under
      //    one of OUR managed labels so we can skip it while fetching.
      const idx = await buildLabelIndex(token)
      setLabelIndex(idx)

      // Active exclusions (drop expired snoozes) — also used to skip snoozed mail.
      const activeExclusions = exclusionsStore.pruneExpired(exclusionsStore.load())
      exclusionsStore.save(activeExclusions)
      setExclusions(activeExclusions)

      // 2. Fetch ~100 emails worth reviewing, paging past mail that's already
      //    handled: filed under one of our managed labels, or snoozed/excluded.
      //    Managed labels are matched by ID — this never matches Gmail's auto
      //    Promotions/Social/Updates/Forums categories (their CATEGORY_* ids aren't
      //    in this set), so those still get reviewed normally.
      const managedLabelIds = new Set(
        LABEL_RULES.map((r) => idx[r.label.toLowerCase()]).filter(Boolean)
      )
      const keep = (email) =>
        !email.labelIds.some((id) => managedLabelIds.has(id)) &&
        !exclusionsStore.isExcluded(email, activeExclusions, now)
      const fetched = await fetchInboxForReview(token, { target: 100, keep })
      setEmails(fetched)

      // 3. Classify with Anthropic, then apply persisted corrections on top so
      //    manual moves + learned sender rules survive reload/Refresh.
      const base = await classifyEmails(apiKey, fetched)
      setBaseClassifications(base)
      const activeCorrections = correctionsStore.load()
      setCorrections(activeCorrections)
      const cls = correctionsStore.applyToClassifications(base, fetched, activeCorrections)
      setClassifications(cls)

      // 4. Generate staged changes. Creation changes go first so "Create new
      //    labels" is acted on before labeling.
      const { labelCreationChanges, labelChanges, cleanupChanges } = generateStagedChanges(fetched, cls, activeExclusions, now, idx)
      setStagedChanges([...labelCreationChanges, ...labelChanges, ...cleanupChanges])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleConnect() {
    requestGmailAccess()
  }

  function handleSignOut() {
    clearStoredToken()
    setAccessToken(null)
    setEmails([])
    setBaseClassifications(new Map())
    setClassifications(new Map())
    setStagedChanges([])
  }

  function handleRefresh() {
    if (accessToken) loadEmails(accessToken)
  }

  // Run the ground-truth accuracy eval against existing Gmail labels.
  async function handleRunEval() {
    const apiKey = localStorage.getItem('anthropic_key')
    if (!accessToken || !apiKey) {
      setEvalState({ open: true, loading: false, report: null, error: 'Need Gmail connected and an Anthropic key.' })
      return
    }
    setEvalState({ open: true, loading: true, report: null, error: null })
    try {
      const report = await runLabelEval(accessToken, apiKey, { perLabel: 15 })
      setEvalState({ open: true, loading: false, report, error: null })
    } catch (err) {
      console.error(err)
      setEvalState({ open: true, loading: false, report: null, error: err.message })
    }
  }

  // Approve a single staged change
  async function handleApprove(change) {
    if (!change || !accessToken) return
    const labelCache = {}
    try {
      await executeStagedChange(accessToken, change, labelCache)
      setStagedChanges((prev) =>
        prev.map((c) => (c.id === change.id ? { ...c, status: 'approved' } : c))
      )
    } catch (err) {
      console.error('Failed to apply change:', err)
      setError(`Failed to apply: ${err.message}`)
    }
  }

  // Recompute staged changes from current emails/classifications for a given
  // exclusion set, preserving the status of any change already approved/skipped
  // so we never re-stage (or re-apply) something the user already acted on.
  const regenerate = useCallback((nextExclusions, nextClassifications = classifications) => {
    setStagedChanges((prev) => {
      const prevById = new Map(prev.map((c) => [c.id, c]))
      // Manual "🗑 Trash it" changes aren't derived from classification, so
      // generateStagedChanges won't recreate them — carry them over verbatim, and
      // let them win over any generated change for the same email (the user chose to
      // trash it, not label/cleanup it).
      const manualTrashes = prev.filter((c) => c.ruleId === 'manual-trash')
      const trashedIds = new Set(manualTrashes.map((c) => c.emailId))
      const { labelCreationChanges, labelChanges, cleanupChanges } = generateStagedChanges(
        emails, nextClassifications, nextExclusions, Date.now(), labelIndex
      )
      const generated = [...labelCreationChanges, ...labelChanges, ...cleanupChanges]
        .filter((c) => !trashedIds.has(c.emailId))
        .map((c) => {
          const old = prevById.get(c.id)
          return old && old.status !== 'pending' ? { ...c, status: old.status } : c
        })
      return [...generated, ...manualTrashes]
    })
  }, [emails, classifications, labelIndex])

  // "Leave as-is": persist an exclusion for this email and re-generate staged
  // changes so its pending items disappear immediately.
  function handleExclude(email, mode, until) {
    if (!email) return
    const target = { type: 'message', value: email.id, label: email.subject }
    const next = exclusionsStore.add(exclusions, { target, mode, until })
    exclusionsStore.save(next)
    setExclusions(next)
    regenerate(next)
  }

  // Undo an exclusion (remove from the Excluded panel) and re-stage anything it
  // was suppressing.
  function handleRemoveExclusion(id) {
    const next = exclusionsStore.remove(exclusions, id)
    exclusionsStore.save(next)
    setExclusions(next)
    regenerate(next)
  }

  // "Move to": persist the correction, re-derive classifications from the raw
  // classifier output, and re-stage so the email immediately moves to its new
  // category's section/queue (e.g. Other → promotional lands in the Cleanup Queue
  // with a Delete action). scope 'message' = this email; 'sender' = a learned rule.
  function handleMove(email, toCategory, scope) {
    if (!email || !toCategory) return
    const from = classifications.get(email.id)?.category ?? null
    const next = correctionsStore.addMove(corrections, { email, from, to: toCategory, scope })
    correctionsStore.save(next)
    setCorrections(next)
    const derived = correctionsStore.applyToClassifications(baseClassifications, emails, next)
    setClassifications(derived)
    regenerate(exclusions, derived)
  }

  // "🗑 Trash it": stage a direct trash for this one message, independent of its
  // category. Approval-first — this only stages a pending trash; nothing is deleted
  // until the user approves it. The manual trash supersedes any other PENDING change
  // for the same email (you chose to trash it, not label/cleanup it); already-approved
  // changes stay as history. Re-clicking is idempotent.
  function handleTrash(email) {
    if (!email) return
    const change = makeManualTrash(email)
    setStagedChanges((prev) => {
      const kept = prev.filter((c) => c.emailId !== email.id || c.status !== 'pending')
      if (kept.some((c) => c.id === change.id)) return kept
      return [...kept, change]
    })
  }

  // Bulk "🗑 Trash selected" from the Cleanup Queue multi-select: stage a manual
  // trash for each checked email (staged-not-immediate, like the single Trash it —
  // each becomes a pending Delete the user then approves via "Apply selected").
  // Supersedes other pending changes for those emails; keeps approved history.
  function handleTrashMany(emailsToTrash) {
    if (!emailsToTrash?.length) return
    const changes = emailsToTrash.map(makeManualTrash)
    const ids = new Set(emailsToTrash.map((e) => e.id))
    setStagedChanges((prev) => {
      const kept = prev.filter((c) => !ids.has(c.emailId) || c.status !== 'pending')
      const have = new Set(kept.map((c) => c.id))
      return [...kept, ...changes.filter((c) => !have.has(c.id))]
    })
  }

  // Bulk "Leave as-is" from the Cleanup Queue multi-select: snooze/exclude every
  // checked email at once, then regenerate so their staged rows disappear together.
  function handleExcludeMany(emailsToExclude, mode, until) {
    if (!emailsToExclude?.length) return
    let next = exclusions
    for (const email of emailsToExclude) {
      next = exclusionsStore.add(next, {
        target: { type: 'message', value: email.id, label: email.subject },
        mode,
        until,
      })
    }
    exclusionsStore.save(next)
    setExclusions(next)
    regenerate(next)
  }

  // Undo a correction (from the Learned rules panel) — re-derive from base.
  function handleRemoveCorrection(id) {
    const next = correctionsStore.remove(corrections, id)
    correctionsStore.save(next)
    setCorrections(next)
    const derived = correctionsStore.applyToClassifications(baseClassifications, emails, next)
    setClassifications(derived)
    regenerate(exclusions, derived)
  }

  // Approve all changes in a batch
  async function handleApproveAll(changes) {
    if (!accessToken) return
    const labelCache = {}
    for (const change of changes) {
      try {
        await executeStagedChange(accessToken, change, labelCache)
        setStagedChanges((prev) =>
          prev.map((c) => (c.id === change.id ? { ...c, status: 'approved' } : c))
        )
      } catch (err) {
        console.error('Failed to apply change:', err)
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!accessToken) {
    return (
      <LoginScreen
        onConnect={handleConnect}
        clientId={clientId}
        onClientIdChange={setClientId}
      />
    )
  }

  return (
    <>
      {error && (
        <div style={errorBannerStyle}>
          ⚠️ {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}
      <InboxDigest
        emails={emails}
        classifications={classifications}
        stagedChanges={stagedChanges}
        onApprove={handleApprove}
        onExclude={handleExclude}
        onTrash={handleTrash}
        onTrashMany={handleTrashMany}
        onExcludeMany={handleExcludeMany}
        onApproveAll={handleApproveAll}
        onRefresh={handleRefresh}
        loading={loading}
        onSignOut={handleSignOut}
        exclusions={exclusions}
        onRemoveExclusion={handleRemoveExclusion}
        labelIndex={labelIndex}
        onMove={handleMove}
        learnedRules={correctionsStore.senderRules(corrections)}
        onRemoveCorrection={handleRemoveCorrection}
      />
      <button
        onClick={handleRunEval}
        disabled={evalState.loading}
        style={evalButtonStyle}
        title="Score the classifier against your existing Gmail labels"
      >
        {evalState.loading ? 'Checking…' : '📊 Accuracy check'}
      </button>
      <EvalPanel state={evalState} onClose={() => setEvalState((s) => ({ ...s, open: false }))} />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}

const evalButtonStyle = {
  position: 'fixed',
  bottom: '16px',
  right: '16px',
  background: '#fff',
  border: '1px solid #d1d5db',
  color: '#374151',
  padding: '8px 14px',
  borderRadius: 'var(--radius)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  zIndex: 100,
  boxShadow: 'var(--shadow-md)',
}

const errorBannerStyle = {
  position: 'fixed',
  bottom: '16px',
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#fef2f2',
  border: '1px solid #fca5a5',
  color: '#b91c1c',
  padding: '10px 16px',
  borderRadius: 'var(--radius)',
  fontSize: '13px',
  fontWeight: 500,
  zIndex: 100,
  boxShadow: 'var(--shadow-md)',
  display: 'flex',
  alignItems: 'center',
  maxWidth: '500px',
}
