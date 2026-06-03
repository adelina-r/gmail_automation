import { useState, useEffect, useCallback } from 'react'
import LoginScreen from './components/LoginScreen.jsx'
import InboxDigest from './components/InboxDigest.jsx'
import EvalPanel from './components/EvalPanel.jsx'
import { initGoogleAuth, requestGmailAccess, getStoredToken, clearStoredToken, executeStagedChange, fetchInboxEmails } from './lib/gmail.js'
import { classifyEmails } from './lib/anthropic.js'
import { generateStagedChanges } from './lib/rules.js'
import { runLabelEval } from './lib/eval.js'

// ── Configuration ────────────────────────────────────────────────────────────
// Set your Google OAuth Client ID here OR enter it in the login screen
const DEFAULT_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export default function App() {
  const [clientId, setClientId] = useState(DEFAULT_CLIENT_ID)
  const [accessToken, setAccessToken] = useState(() => getStoredToken())
  const [emails, setEmails] = useState([])
  const [classifications, setClassifications] = useState(new Map())
  const [stagedChanges, setStagedChanges] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [evalState, setEvalState] = useState({ open: false, loading: false, report: null, error: null })

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
      // 1. Fetch emails
      const fetched = await fetchInboxEmails(token, 100)
      setEmails(fetched)

      // 2. Classify with Anthropic
      const cls = await classifyEmails(apiKey, fetched)
      setClassifications(cls)

      // 3. Generate staged changes
      const { labelChanges, cleanupChanges } = generateStagedChanges(fetched, cls)
      setStagedChanges([...labelChanges, ...cleanupChanges])
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

  // Skip a staged change (keep email as-is)
  function handleSkip(change) {
    if (!change) return
    setStagedChanges((prev) =>
      prev.map((c) => (c.id === change.id ? { ...c, status: 'skipped' } : c))
    )
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
        onSkip={handleSkip}
        onApproveAll={handleApproveAll}
        onRefresh={handleRefresh}
        loading={loading}
        onSignOut={handleSignOut}
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
