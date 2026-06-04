/**
 * Gmail API client
 * All calls require a valid access token from Google Identity Services.
 */

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

// ─── Auth ────────────────────────────────────────────────────────────────────

let _tokenClient = null

/**
 * Initialize the Google Identity Services token client.
 * Must be called once after the GIS script has loaded.
 */
export function initGoogleAuth(clientId, onToken) {
  return new Promise((resolve) => {
    // Wait for GIS to be ready
    const check = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(check)
        _tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/gmail.modify',
          callback: (response) => {
            if (response.error) {
              console.error('OAuth error:', response.error)
              return
            }
            const expiresAt = Date.now() + response.expires_in * 1000
            const tokenData = { token: response.access_token, expiresAt }
            sessionStorage.setItem('gmail_token', JSON.stringify(tokenData))
            onToken(response.access_token)
          },
        })
        resolve(_tokenClient)
      }
    }, 100)
  })
}

/**
 * Trigger the OAuth popup. Calls onToken callback when complete.
 */
export function requestGmailAccess() {
  if (!_tokenClient) throw new Error('Token client not initialized')
  _tokenClient.requestAccessToken()
}

/**
 * Get the stored access token, or null if expired/missing.
 */
export function getStoredToken() {
  try {
    const raw = sessionStorage.getItem('gmail_token')
    if (!raw) return null
    const { token, expiresAt } = JSON.parse(raw)
    if (Date.now() >= expiresAt - 60_000) {
      sessionStorage.removeItem('gmail_token')
      return null
    }
    return token
  } catch {
    return null
  }
}

export function clearStoredToken() {
  sessionStorage.removeItem('gmail_token')
  if (window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(getStoredToken?.() ?? '')
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function gmailFetch(token, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `Gmail API error ${res.status}`)
  }
  return res.json()
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export async function fetchLabels(token) {
  const data = await gmailFetch(token, '/labels')
  return data.labels ?? []
}

/**
 * Fetch labels and return a map of lowercased label NAME → label ID.
 * Used by generateStagedChanges to detect already-labeled mail by ID
 * (email.labelIds holds IDs, not names).
 */
export async function buildLabelIndex(token) {
  const labels = await fetchLabels(token)
  const index = {}
  for (const l of labels) {
    if (l.name) index[l.name.toLowerCase()] = l.id
  }
  return index
}

/**
 * Resolve a label NAME → ID without creating it. Returns null if it doesn't
 * exist. Used by the `label` action so labeling never silently creates a label
 * (creation is a separate, approval-first `create-label` step).
 */
export async function findLabelId(token, name) {
  const labels = await fetchLabels(token)
  const found = labels.find((l) => l.name.toLowerCase() === name.toLowerCase())
  return found ? found.id : null
}

export async function findOrCreateLabel(token, name) {
  const labels = await fetchLabels(token)
  const existing = labels.find(
    (l) => l.name.toLowerCase() === name.toLowerCase()
  )
  if (existing) return existing.id

  const created = await gmailFetch(token, '/labels', {
    method: 'POST',
    body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
  })
  return created.id
}

// ─── Messages ────────────────────────────────────────────────────────────────

/**
 * List one page of message ids for a query.
 * @returns {{ ids: string[], nextPageToken: string|null }}
 */
async function listMessages(token, query, { pageToken, maxResults = 100 } = {}) {
  const params = new URLSearchParams({ maxResults: String(maxResults), q: query })
  if (pageToken) params.set('pageToken', pageToken)
  const data = await gmailFetch(token, `/messages?${params.toString()}`)
  return {
    ids: (data.messages ?? []).map((m) => m.id),
    nextPageToken: data.nextPageToken ?? null,
  }
}

/**
 * Fetch + parse metadata (From/Subject/Date + snippet) for a list of message ids,
 * in parallel batches of 20. Returns parsed email objects.
 */
async function fetchMetadata(token, ids) {
  const BATCH = 20
  const results = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH)
    const details = await Promise.all(
      batch.map((id) =>
        gmailFetch(
          token,
          `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        )
      )
    )
    results.push(...details.map(parseMessage))
  }
  return results
}

/**
 * Fetch messages matching an arbitrary Gmail query (metadata only for speed).
 * Returns an array of parsed email objects. (Single page; used by the eval.)
 */
export async function fetchEmailsByQuery(token, query, maxResults = 100) {
  const { ids } = await listMessages(token, query, { maxResults })
  if (ids.length === 0) return []
  return fetchMetadata(token, ids)
}

/**
 * Fetch up to `target` inbox emails worth reviewing. Pages through the inbox,
 * dropping mail the caller wants to skip (`keep(email) === false` — e.g. already
 * filed under a managed label, or snoozed/excluded), and keeps paging until it has
 * `target` keepers or runs out. `maxFetched` caps total messages pulled so a huge
 * inbox full of handled mail can't run the fetch (or token cost) away.
 *
 * This is what reclaims the fixed-100 window: instead of "the 100 most-recent
 * inbox messages" (which handled mail eats into), it's "up to 100 that still need
 * review, looking further back as needed."
 */
export async function fetchInboxForReview(
  token,
  { query = 'in:inbox -is:draft', target = 100, keep = () => true, maxFetched = 300 } = {}
) {
  const kept = []
  let pageToken = null
  let fetched = 0
  do {
    const remaining = Math.min(100, maxFetched - fetched)
    if (remaining <= 0) break
    const page = await listMessages(token, query, { pageToken, maxResults: remaining })
    if (page.ids.length === 0) break
    fetched += page.ids.length
    const parsed = await fetchMetadata(token, page.ids)
    for (const email of parsed) {
      if (keep(email)) kept.push(email)
    }
    pageToken = page.nextPageToken
  } while (pageToken && kept.length < target && fetched < maxFetched)
  return kept.slice(0, target)
}

/**
 * Parse a Gmail message response into a clean object.
 */
function parseMessage(msg) {
  const headers = msg.payload?.headers ?? []
  const get = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

  const from = get('From')
  const emailMatch = from.match(/<(.+?)>/)
  const senderEmail = emailMatch ? emailMatch[1] : from
  const senderName = emailMatch ? from.replace(/<.+?>/, '').trim().replace(/^"|"$/g, '') : from

  return {
    id: msg.id,
    threadId: msg.threadId,
    subject: get('Subject') || '(no subject)',
    senderName,
    senderEmail,
    date: get('Date'),
    dateMs: msg.internalDate ? Number(msg.internalDate) : 0,
    snippet: msg.snippet ?? '',
    labelIds: msg.labelIds ?? [],
    isUnread: (msg.labelIds ?? []).includes('UNREAD'),
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function applyLabelToMessage(token, messageId, labelId) {
  return gmailFetch(token, `/messages/${messageId}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds: [labelId] }),
  })
}

/**
 * "File" a message: add the label AND remove it from the inbox (archive) in one
 * call. Filing means it's off your plate — so it no longer consumes the fetch
 * window or gets re-classified every run. Still findable under its label.
 */
export async function fileMessage(token, messageId, labelId) {
  return gmailFetch(token, `/messages/${messageId}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds: [labelId], removeLabelIds: ['INBOX'] }),
  })
}

export async function trashMessage(token, messageId) {
  return gmailFetch(token, `/messages/${messageId}/trash`, { method: 'POST' })
}

export async function archiveMessage(token, messageId) {
  return gmailFetch(token, `/messages/${messageId}/modify`, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
  })
}

/**
 * Execute a staged change.
 */
export async function executeStagedChange(token, change, labelCache) {
  switch (change.action) {
    case 'create-label': {
      // The ONLY path that creates a Gmail label — explicit and approval-first.
      const labelId = await findOrCreateLabel(token, change.label)
      labelCache[change.label.toLowerCase()] = labelId
      break
    }
    case 'label': {
      const key = change.label.toLowerCase()
      let labelId = labelCache[key]
      // Resolve by name only — never create here. A missing label means its
      // approval-first "Create new labels" step hasn't been approved yet.
      if (!labelId) labelId = await findLabelId(token, change.label)
      if (!labelId) {
        throw new Error(
          `Label "${change.label}" doesn't exist yet — approve the "Create new labels" step first.`
        )
      }
      labelCache[key] = labelId
      // Filing labels AND archives (removes INBOX) so handled mail leaves the inbox.
      await fileMessage(token, change.emailId, labelId)
      break
    }
    case 'trash':
      await trashMessage(token, change.emailId)
      break
    case 'archive':
      await archiveMessage(token, change.emailId)
      break
    default:
      console.warn('Unknown action:', change.action)
  }
}
