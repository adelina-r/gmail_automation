/**
 * Persistent exclusions / snooze store ("Leave as-is").
 *
 * Replaces the old session-only "Skip": an excluded email's staged changes are
 * suppressed and the choice survives reloads (localStorage, key `gmail_exclusions`).
 *
 * Entry shape:
 *   {
 *     id,                         // stable unique id
 *     target: { type, value },    // see matchesTarget below
 *     mode: 'until' | 'forever',  // snooze vs. permanent
 *     until: ISO-string | null,   // expiry when mode === 'until'
 *     createdAt: ISO-string,
 *   }
 *
 * `target.type`:
 *   - 'message'       → value = Gmail message id            (exact match)
 *   - 'sender'        → value = email-address substring     (case-insensitive)
 *   - 'senderSubject' → value = { sender, keyword }         (both substrings)
 *
 * The matcher handles all three types now; Unit 1 only *creates* `message`
 * exclusions from the UI. Sender / keyword creation is deferred to Unit 3.
 */

const STORAGE_KEY = 'gmail_exclusions'

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

export function save(exclusions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(exclusions))
}

// ── Mutators (pure — return a new array, caller persists) ─────────────────────

function genId() {
  return `ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Add an exclusion. Returns a new array (does not persist — caller saves).
 * @param {Array} exclusions
 * @param {{target: object, mode?: 'until'|'forever', until?: string|null}} entry
 */
export function add(exclusions, { target, mode = 'forever', until = null }) {
  const created = {
    id: genId(),
    target,
    mode,
    until: mode === 'until' ? until : null,
    createdAt: new Date().toISOString(),
  }
  return [...exclusions, created]
}

export function remove(exclusions, id) {
  return exclusions.filter((e) => e.id !== id)
}

/** Drop expired snoozes. Returns a new array. */
export function pruneExpired(exclusions, now = Date.now()) {
  return exclusions.filter((e) => !isExpired(e, now))
}

// ── Matching ──────────────────────────────────────────────────────────────────

function isExpired(ex, now) {
  if (ex.mode !== 'until' || !ex.until) return false
  const t = Date.parse(ex.until)
  if (Number.isNaN(t)) return false
  return now >= t
}

function matchesTarget(email, target) {
  if (!target) return false
  const { type, value } = target
  switch (type) {
    case 'message':
      return email.id === value
    case 'sender': {
      const sender = (email.senderEmail ?? '').toLowerCase()
      return sender.includes(String(value ?? '').toLowerCase())
    }
    case 'senderSubject': {
      const sender = (email.senderEmail ?? '').toLowerCase()
      const subject = (email.subject ?? '').toLowerCase()
      const wantSender = String(value?.sender ?? '').toLowerCase()
      const wantKeyword = String(value?.keyword ?? '').toLowerCase()
      return sender.includes(wantSender) && subject.includes(wantKeyword)
    }
    default:
      return false
  }
}

/**
 * Is this email currently excluded? Expired snoozes never match.
 * @param {object} email - parsed email object
 * @param {Array} exclusions
 * @param {number} now - Date.now(), injectable for tests
 */
export function isExcluded(email, exclusions, now = Date.now()) {
  for (const ex of exclusions) {
    if (isExpired(ex, now)) continue
    if (matchesTarget(email, ex.target)) return true
  }
  return false
}
