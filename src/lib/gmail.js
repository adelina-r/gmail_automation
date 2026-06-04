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
 * Fetch messages matching an arbitrary Gmail query (metadata only for speed).
 * Returns an array of parsed email objects.
 */
export async function fetchEmailsByQuery(token, query, maxResults = 100) {
  const listData = await gmailFetch(
    token,
    `/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`
  )
  const messages = listData.messages ?? []
  if (messages.length === 0) return []

  // Fetch details in parallel batches of 20
  const BATCH = 20
  const results = []
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH)
    const details = await Promise.all(
      batch.map((m) =>
        gmailFetch(
          token,
          `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        )
      )
    )
    results.push(...details)
  }

  return results.map(parseMessage)
}

/**
 * Fetch a page of inbox messages (metadata only for speed).
 * Returns an array of parsed email objects.
 */
export async function fetchInboxEmails(token, maxResults = 100) {
  return fetchEmailsByQuery(token, 'in:inbox -is:draft', maxResults)
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
    case 'label': {
      let labelId = labelCache[change.label]
      if (!labelId) {
        labelId = await findOrCreateLabel(token, change.label)
        labelCache[change.label] = labelId
      }
      await applyLabelToMessage(token, change.emailId, labelId)
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
