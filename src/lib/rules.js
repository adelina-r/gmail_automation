/**
 * Rule definitions — mirrors the rules approved by Adelina in Phase 1.
 * Each rule maps a classification category (or sender pattern) to a suggested action.
 *
 * These are used to auto-generate staged changes after classification.
 */

import { isExcluded } from './exclusions.js'

/**
 * Sender-based overrides. These bypass the AI classifier for known senders —
 * cheaper and deterministic (per categorization-feedback.md §G). A rule either
 * FORCES a category (skip the AI entirely) or GUARDS against one (`never`:
 * downgrade if the AI picks a forbidden category).
 *
 * Matching: case-insensitive substring against the fields in `matchFields`
 * (default: senderEmail + senderName; mailing-list tags also check subject).
 * If `subjectAny` is set, the rule only matches when the subject contains one
 * of those substrings — used to keep portal "new message" stubs out of billing.
 *
 * IMPORTANT: medical billing routes to the existing `HSA Tracking` Gmail label,
 * NOT a "medical" label. We never create a medical label. Appointment reminders
 * and portal stubs are deliberately NOT forced here.
 */
export const SENDER_RULES = [
  {
    id: 'sender-sutter-billing',
    name: 'Sutter billing → HSA Tracking',
    match: ['no-reply_billing@care.sutterhealth.org', 'myhealthonline@sutterhealth.org'],
    category: 'medical_billing',
    reason: 'Sutter billing address → HSA Tracking',
    enabled: true,
  },
  {
    id: 'sender-midi-billing',
    name: 'Midi billing → HSA Tracking',
    match: ['patient-message.com'],
    subjectAny: ['receipt', 'statement', 'balance', 'payment', 'charges', 'pay'],
    category: 'medical_billing',
    reason: 'Midi billing (patient-message.com) → HSA Tracking',
    enabled: true,
  },
  {
    id: 'sender-cigna',
    name: 'Cigna → HSA Tracking (medical, not P&C insurance)',
    match: ['cigna.com', 'cigna'],
    category: 'medical_billing',
    reason: 'Cigna is medical insurance (EOBs/statements) → HSA Tracking, not the P&C insurance label',
    enabled: true,
  },
  {
    id: 'sender-mercury',
    name: 'Mercury → insurance (P&C)',
    match: ['mercuryinsurance.com', 'mercury insurance'],
    category: 'insurance',
    reason: 'Mercury is a property/casualty insurer → insurance label',
    enabled: true,
  },
  {
    id: 'sender-midi-care-guard',
    name: 'Midi care@joinmidi.com → never insurance',
    match: ['care@joinmidi.com'],
    never: 'insurance',
    reason: 'Midi appointment/portal/marketing mail is not P&C insurance — block the wrong label until the prompt is tuned',
    enabled: true,
  },
  {
    id: 'sender-scclc-exchange',
    name: '[scclc-exchange] list → never Needs Action',
    match: ['[scclc-exchange]'],
    matchFields: ['subject', 'senderName', 'senderEmail'],
    never: 'action_needed',
    reason: 'scclc-exchange list is low-priority; never auto-flag Needs Action',
    enabled: true,
  },
  {
    id: 'sender-2028-families',
    name: '[2028-families] list → school',
    match: ['[2028-families]'],
    matchFields: ['subject', 'senderName', 'senderEmail'],
    category: 'school',
    reason: '2028-families school list → school (child care label)',
    enabled: true,
  },
]

/**
 * Find the first matching sender rule for an email, or null.
 */
export function matchSenderRule(email) {
  if (!email) return null
  for (const rule of SENDER_RULES) {
    if (!rule.enabled) continue
    const fields = rule.matchFields ?? ['senderEmail', 'senderName']
    const text = fields.map((f) => email[f] ?? '').join(' ').toLowerCase()
    if (!rule.match.some((m) => text.includes(m.toLowerCase()))) continue
    if (rule.subjectAny) {
      const subj = (email.subject ?? '').toLowerCase()
      if (!rule.subjectAny.some((s) => subj.includes(s.toLowerCase()))) continue
    }
    return rule
  }
  return null
}

/**
 * Resolve a final category for an email given an (optional) AI category.
 * - Forced-category rule → returns that category, bypassedAi: true.
 * - `never` guardrail     → if the AI picked the forbidden category, downgrade
 *                           to 'other'; otherwise leave the AI category as-is.
 * - No match              → returns the AI category unchanged.
 * Returns null only when there's no rule and no AI category to fall back on.
 */
export function resolveCategory(email, aiCategory = null, aiReason = '') {
  const rule = email ? matchSenderRule(email) : null
  if (rule?.category) {
    return { category: rule.category, reason: rule.reason, bypassedAi: true }
  }
  if (rule?.never && aiCategory === rule.never) {
    return { category: 'other', reason: rule.reason, bypassedAi: false }
  }
  if (aiCategory) return { category: aiCategory, reason: aiReason, bypassedAi: false }
  return null
}

export const LABEL_RULES = [
  {
    id: 'insurance-label',
    name: 'Label insurance emails',
    category: 'insurance',
    action: 'label',
    label: 'insurance',
    enabled: true,
  },
  {
    id: 'medical-billing-label',
    name: 'Label medical billing → HSA Tracking',
    category: 'medical_billing',
    action: 'label',
    label: 'HSA Tracking', // existing label — never creates a "medical" label
    enabled: true,
  },
  {
    id: 'travel-label',
    name: 'Label travel emails',
    category: 'travel',
    action: 'label',
    label: 'travel',
    enabled: true,
  },
  {
    // Replaces the retired `finance` rule — `Old Labels/finance` is archived (C1).
    id: 'financial-label',
    name: 'Label keep-worthy financial emails',
    category: 'financial',
    action: 'label',
    label: 'financial', // NEW label — created approval-first
    enabled: true,
  },
  {
    id: 'school-label',
    name: 'Label school/kids emails',
    category: 'school',
    action: 'label',
    label: 'child care',
    enabled: true,
  },
  {
    id: 'shipping-label',
    name: 'Label shipping/order updates',
    category: 'shipping_orders',
    action: 'label',
    label: 'Shipping & Pending Orders', // NEW label — created approval-first
    enabled: true,
  },
  {
    id: 'scheduling-label',
    name: 'Label scheduling/reminders',
    category: 'scheduling_reminders',
    action: 'label',
    label: 'Scheduling & Reminders', // NEW label — created approval-first
    enabled: true,
  },
  {
    id: 'keep-label',
    name: 'Label keep-safe items (gift cards, vouchers)',
    category: 'keep',
    action: 'label',
    label: 'keep', // NEW label — created approval-first
    enabled: true,
  },
]

export const CLEANUP_RULES = [
  {
    id: 'otp-trash',
    name: 'Delete OTP/verification emails',
    category: 'otp',
    action: 'trash',
    enabled: true,
  },
  {
    id: 'statement-archive',
    name: 'Archive "statement ready" notices',
    category: 'statement_notice',
    action: 'archive',
    enabled: true,
  },
  {
    // Highest-volume junk — trash on approval. No age gate: a promo is disposable
    // the moment it arrives.
    id: 'promotional-trash',
    name: 'Delete promotional / marketing emails',
    category: 'promotional',
    action: 'trash',
    enabled: true,
  },
  {
    // Newsletters are reading material the user may value, so we don't trash them
    // and we only archive once they've aged out of the inbox (like shipping decay).
    id: 'newsletter-archive',
    name: 'Archive older newsletters',
    category: 'newsletter',
    action: 'archive',
    minAgeDays: 30, // only stage when older than 30 days
    enabled: true,
  },
  {
    // FYI/confirmation mail ("payment received", "new device sign-in", "delivered"):
    // good to see once, no action, not worth keeping on file. Lifecycle: archive
    // while fresh (out of the inbox but still findable), then escalate to a staged
    // trash once it ages past `trashAfterDays` — "archive for now, delete in a week
    // unless I set it to keep" (keep = Leave as-is, or Move to → keep). The same
    // threshold gates bulk "Clear all": fresh (still-archive) notifications are
    // per-row only; the escalated trashes are swept in bulk. Tune the one knob below.
    id: 'notification-archive',
    name: 'Archive notifications, trash after a week',
    category: 'notification',
    action: 'archive',
    trashAfterDays: 7, // archive while ≤7d old, then stage trash once older
    enabled: true,
  },
]

// ── Time-decay config (days) ─────────────────────────────────────────────────
// Transient mail (shipping, scheduling) files to a label, then ages out to a
// staged trash. Scheduling decays off the EVENT date (received-age is wrong for a
// "2 months out" invite); shipping decays off received-age; calendar invites
// quick-decay since they're redundant once they've sat a few days.
const DAY_MS = 86400000
export const DECAY = {
  shippingAfterDays: 14,        // shipping_orders: days since received
  schedulingGraceDays: 3,       // scheduling_reminders: days after eventDate
  schedulingFallbackDays: 30,   // scheduling_reminders with no parseable eventDate
  calendarInviteAfterDays: 3,   // calendar invites: days since received
}

/**
 * Detect a Google Calendar invite from metadata alone (no RSVP state available).
 * Runs independently of the AI category so a misclassified invite is still caught.
 */
export function isCalendarInvite(email) {
  const from = (email.senderEmail ?? '').toLowerCase()
  if (from.includes('calendar-notification@google.com')) return true
  const subj = (email.subject ?? '').toLowerCase()
  return /^(invitation:|updated invitation:|canceled event:|accepted:|declined:|tentative:)/.test(subj)
}

/**
 * Should this email be staged for trash now (past its useful life)?
 * @param {object} cls - {category, eventDate}
 * @param {number} now - Date.now(), injectable for tests
 */
export function shouldDecayTrash(email, cls, now = Date.now()) {
  const ageDays = (now - email.dateMs) / DAY_MS
  if (isCalendarInvite(email)) return ageDays > DECAY.calendarInviteAfterDays
  if (cls.category === 'shipping_orders') return ageDays > DECAY.shippingAfterDays
  if (cls.category === 'scheduling_reminders') {
    if (cls.eventDate) {
      const eventMs = Date.parse(`${cls.eventDate}T23:59:59`)
      if (!Number.isNaN(eventMs)) return now > eventMs + DECAY.schedulingGraceDays * DAY_MS
    }
    return ageDays > DECAY.schedulingFallbackDays // no parseable date → received-age fallback
  }
  return false
}

function decayReason(email, cls) {
  if (isCalendarInvite(email)) return 'Calendar invite — likely already on your calendar (3+ days old)'
  if (cls.category === 'shipping_orders') return 'Order/shipping update older than 14 days'
  if (cls.eventDate) return `Scheduled event ${cls.eventDate} has passed`
  return 'Scheduling reminder older than 30 days'
}

/**
 * Is this email already filed under the Gmail label its category would apply?
 * Shared by `generateStagedChanges` (don't re-stage already-filed mail) and the
 * digest UI (collapse already-filed mail out of the main view). Returns false for
 * categories with no label rule (e.g. action_needed, other) and for NEW labels not
 * yet created (absent from labelIndex), so those still appear/stage normally.
 *
 * @param {object} email - parsed email; uses email.labelIds (Gmail label IDs)
 * @param {object} cls - classification {category, ...}
 * @param {Object} labelIndex - lowercased label NAME → label ID
 */
export function isFiled(email, cls, labelIndex = {}) {
  if (!cls) return false
  for (const rule of LABEL_RULES) {
    if (!rule.enabled || cls.category !== rule.category) continue
    const id = labelIndex[rule.label.toLowerCase()]
    if (id && (email.labelIds ?? []).includes(id)) return true
  }
  return false
}

/**
 * Build a one-time, approval-first "create this Gmail label" staged change.
 * Not tied to a single email (emailId/sender fields are null); `id` is keyed on
 * the label name so it stays stable across re-generations (status preserved).
 * Executing it is the ONLY path that creates a label — `label` actions never
 * create one silently (see gmail.js `executeStagedChange`).
 */
function makeLabelCreation(labelName) {
  return {
    id: `create-label-${labelName.toLowerCase()}`,
    ruleId: 'create-label',
    emailId: null,
    subject: labelName,
    senderName: null,
    senderEmail: null,
    date: null,
    dateMs: 0,
    action: 'create-label',
    label: labelName,
    reason: `New label "${labelName}" doesn't exist in your Gmail yet — approve to create it.`,
    status: 'pending',
  }
}

/**
 * Build a staged "trash this one message" change from the generic "🗑 Trash it"
 * affordance — independent of category/classification. Reuses makeChange + the
 * existing trash execution path (gmail.js). Approval-first: it stages a pending
 * trash; nothing is deleted until the user approves it. `ruleId` 'manual-trash'
 * lets App.jsx recognize + preserve these across re-generation (they aren't
 * derived from classification, so generateStagedChanges won't recreate them).
 */
export function makeManualTrash(email) {
  return makeChange('manual-trash', email, 'trash', null, 'Manually trashed')
}

/** Build a staged-change object in the canonical shape. */
function makeChange(ruleId, email, action, label, reason) {
  return {
    id: `${ruleId}-${email.id}`,
    ruleId,
    emailId: email.id,
    subject: email.subject,
    senderName: email.senderName,
    senderEmail: email.senderEmail,
    date: email.date,
    dateMs: email.dateMs,
    action,
    label,
    reason,
    status: 'pending',
  }
}

/**
 * Generate staged changes from classified emails.
 *
 * @param {Array} emails - parsed email objects
 * @param {Map} classifications - Map<id, {category, reason, eventDate}>
 * @param {Array} exclusions - active exclusion entries (see lib/exclusions.js).
 *   Excluded/snoozed mail is suppressed entirely: no label, cleanup, or
 *   decay-trash change is staged for it.
 * @param {number} now - Date.now(), injectable for tests (drives decay + snooze).
 * @param {Object} labelIndex - map of lowercased label NAME → label ID, built
 *   from the live Gmail label list. Used for the already-labeled check: we
 *   compare the resolved target label ID against `email.labelIds` (which holds
 *   IDs, not names). A label not in the index (e.g. a not-yet-created NEW label)
 *   is treated as "not present" so it still stages — and we stage a one-time
 *   approval-first `create-label` change for it (see labelCreationChanges).
 * @returns {{ labelCreationChanges: StagedChange[], labelChanges: StagedChange[], cleanupChanges: StagedChange[] }}
 */
export function generateStagedChanges(emails, classifications, exclusions = [], now = Date.now(), labelIndex = {}) {
  const labelChanges = []
  const cleanupChanges = []
  // Names of NEW labels (referenced by a staged label change but absent from the
  // live Gmail label index) that need an explicit, approval-first create step.
  const neededNewLabels = new Set()

  for (const email of emails) {
    const cls = classifications.get(email.id)
    if (!cls) continue

    // Persistent "Leave as-is": suppress all staged changes for excluded/snoozed
    // mail (label, cleanup, AND decay-trash) so the app stops re-nagging.
    if (isExcluded(email, exclusions, now)) continue

    // Time-decay: if transient mail is past its useful life, stage a trash and
    // skip labeling — no point filing something we're suggesting to delete.
    if (shouldDecayTrash(email, cls, now)) {
      cleanupChanges.push(makeChange('decay-trash', email, 'trash', null, decayReason(email, cls)))
      continue
    }

    // Label rules — skip entirely if the email already carries its target label.
    // (Gmail's email.labelIds are IDs; isFiled resolves the rule's label NAME → ID
    // via labelIndex and compares by ID — a name-substring compare never matched
    // custom labels, which re-staged already-filed mail every run.)
    if (!isFiled(email, cls, labelIndex)) {
      for (const rule of LABEL_RULES) {
        if (!rule.enabled) continue
        if (cls.category !== rule.category) continue
        // Label is referenced but doesn't exist yet → queue an approval-first create.
        if (!labelIndex[rule.label.toLowerCase()]) neededNewLabels.add(rule.label)
        labelChanges.push(makeChange(rule.id, email, 'label', rule.label, cls.reason))
      }
    }

    // Cleanup rules (category-based: otp, statement_notice, promotional,
    // newsletter, notification)
    for (const rule of CLEANUP_RULES) {
      if (!rule.enabled) continue
      if (cls.category !== rule.category) continue
      const ageDays = (now - email.dateMs) / DAY_MS
      // Escalation: some mail is archived while fresh, then trashed once it ages out
      // (notifications — "archive for now, delete after a week"). When escalated, the
      // suggested action flips archive → trash and the reason explains why.
      const escalate = rule.trashAfterDays != null && ageDays > rule.trashAfterDays
      const action = escalate ? 'trash' : rule.action
      const reason = escalate
        ? `Notification older than ${rule.trashAfterDays} days — no longer needed`
        : cls.reason
      const change = makeChange(rule.id, email, action, null, reason)
      // Age-gated rules always stage a per-row manual action, but recent mail is
      // excluded from BULK "Clear all" (bulkEligible:false) so we don't sweep up
      // newsletters/notifications the user may still want. For escalation rules the
      // SAME threshold gates bulk: while still in the archive window it's per-row
      // only; once escalated to trash it bulk-clears. Older mail bulk-clears.
      const bulkGate = rule.minAgeDays ?? rule.trashAfterDays
      if (bulkGate != null && ageDays <= bulkGate) {
        change.bulkEligible = false
      }
      cleanupChanges.push(change)
    }
  }

  const labelCreationChanges = [...neededNewLabels].map(makeLabelCreation)
  return { labelCreationChanges, labelChanges, cleanupChanges }
}
