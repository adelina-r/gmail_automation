/**
 * Corrections / learned-rules store ("Move to…").
 *
 * When the user manually moves an email to a different category, we persist that
 * choice (localStorage, key `gmail_corrections`) so it survives reloads and a
 * Refresh re-classify. One store serves three jobs:
 *   1. per-message overrides   — this one email's category,
 *   2. learned sender rules     — all mail from a sender → a category,
 *   3. a feedback log           — every move (from → to) for eventual learning/eval.
 *
 * Entry shape (fields chosen to line up with categorization-feedback.csv —
 * Sender / Subject / Wrong category / Correct label):
 *   {
 *     id,                         // stable unique id
 *     type: 'message' | 'sender', // override scope
 *     emailId,                    // message id (always recorded; the key for 'message')
 *     sender,                     // senderEmail (the key for 'sender')
 *     subject,                    // for the log / display
 *     from,                       // category before the move (the AI's guess)
 *     to,                         // category the user chose
 *     createdAt,                  // ISO string
 *   }
 *
 * `applyToClassifications` applies sender rules first, then message overrides, so a
 * message-level move always wins over a sender-level rule for the same email.
 */

const STORAGE_KEY = 'gmail_corrections'

// ── Persistence ───────────────────────────────────────────────────────────────

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function save(corrections) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(corrections))
}

// ── Mutators (pure — return a new array, caller persists) ─────────────────────

function genId() {
  return `co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Record a move. Returns a new array (does not persist — caller saves).
 * Replaces any existing entry with the same scope key (message: emailId,
 * sender: sender) so re-moving updates in place rather than duplicating.
 * @param {Array} corrections
 * @param {{email: object, from: string, to: string, scope: 'message'|'sender'}} move
 */
export function addMove(corrections, { email, from, to, scope = 'message' }) {
  const entry = {
    id: genId(),
    type: scope,
    emailId: email.id,
    sender: email.senderEmail ?? '',
    subject: email.subject ?? '',
    from: from ?? null,
    to,
    createdAt: new Date().toISOString(),
  }
  const sameKey = (e) =>
    e.type === scope &&
    (scope === 'sender' ? e.sender === entry.sender : e.emailId === entry.emailId)
  return [...corrections.filter((e) => !sameKey(e)), entry]
}

export function remove(corrections, id) {
  return corrections.filter((e) => e.id !== id)
}

/** Just the learned sender rules (for the "Learned rules" panel). */
export function senderRules(corrections) {
  return corrections.filter((e) => e.type === 'sender')
}

// ── Application ────────────────────────────────────────────────────────────────

function matchesSender(email, sender) {
  if (!sender) return false
  return (email.senderEmail ?? '').toLowerCase().includes(sender.toLowerCase())
}

/**
 * Derive the displayed classifications by applying corrections on top of the raw
 * classifier output. Pure: takes the BASE map + returns a NEW map (so undo just
 * re-derives from base). Sender rules apply first, then message overrides win.
 *
 * @param {Map} baseMap - raw classifier output Map<id, {category, reason, eventDate}>
 * @param {Array} emails - parsed email objects (to match sender rules against)
 * @param {Array} corrections
 * @returns {Map}
 */
export function applyToClassifications(baseMap, emails, corrections = []) {
  const next = new Map(baseMap)
  if (corrections.length === 0) return next

  const senders = corrections.filter((e) => e.type === 'sender')
  const messages = new Map(
    corrections.filter((e) => e.type === 'message').map((e) => [e.emailId, e])
  )

  for (const email of emails) {
    const base = next.get(email.id)
    let to = null

    // Sender rules first (last matching wins — newest is appended last).
    for (const rule of senders) {
      if (matchesSender(email, rule.sender)) to = rule.to
    }
    // Message override wins over any sender rule.
    const msg = messages.get(email.id)
    if (msg) to = msg.to

    if (to && to !== base?.category) {
      next.set(email.id, {
        ...(base ?? {}),
        category: to,
        reason: `You moved this → ${to}`,
      })
    }
  }
  return next
}
