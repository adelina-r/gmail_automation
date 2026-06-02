/**
 * Anthropic API client — email classification
 *
 * Uses claude-haiku for speed and cost efficiency.
 * Sends emails in batches to minimize API calls.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

export const CATEGORIES = {
  action_needed: { label: 'Needs Action', emoji: '⚡', color: '#ef4444', bg: '#fef2f2' },
  insurance:     { label: 'Insurance',    emoji: '🏥', color: '#0ea5e9', bg: '#f0f9ff' },
  travel:        { label: 'Travel',       emoji: '✈️', color: '#8b5cf6', bg: '#f5f3ff' },
  finance:       { label: 'Finance',      emoji: '💳', color: '#10b981', bg: '#ecfdf5' },
  school:        { label: 'School/Kids',  emoji: '🎒', color: '#f59e0b', bg: '#fffbeb' },
  otp:           { label: 'OTP / Codes',  emoji: '🔑', color: '#6b7280', bg: '#f9fafb' },
  promotional:   { label: 'Promotional',  emoji: '🛍️', color: '#6b7280', bg: '#f9fafb' },
  newsletter:    { label: 'Newsletter',   emoji: '📰', color: '#6b7280', bg: '#f9fafb' },
  other:         { label: 'Other',        emoji: '📬', color: '#6b7280', bg: '#f9fafb' },
}

// Categories that get grouped into the "Cleanup Queue"
export const CLEANUP_CATEGORIES = new Set(['otp', 'promotional', 'newsletter'])

const SYSTEM_PROMPT = `You are an email classifier. For each email, return a JSON classification.

Categories:
- action_needed: requires a reply, RSVP, payment, decision, or any action from the recipient
- insurance: medical, health, dental, auto, or home insurance emails (Cigna, Mercury Insurance, Midi Health, etc.)
- travel: flight, hotel, car rental, travel loyalty programs (Virgin Atlantic, Aer Lingus, Hilton, SAS, etc.)
- finance: bank statements, investment updates, credit cards, financial newsletters (Barclays, diversificapital, etc.)
- school: school newsletters, tutoring, extracurriculars, kids' activities (AoPS, Schoology, dance, sports, etc.)
- otp: one-time passwords, verification codes, password resets, login codes
- promotional: retail sale emails, discount offers, promotional marketing (Nordstrom, Bloomingdale's, Amazon, Ulta, etc.)
- newsletter: regular reading newsletters the person appears to value (NOT promotional offers)
- other: anything that doesn't fit the above

Respond with a JSON array (one object per email) in the same order as input:
[{ "id": "<message_id>", "category": "<category>", "reason": "<one short phrase>" }, ...]

Be concise. Do not add any text outside the JSON array.`

/**
 * Classify a batch of emails.
 * @param {string} apiKey - Anthropic API key
 * @param {Array} emails - array of parsed email objects
 * @returns {Map<string, {category, reason}>}
 */
export async function classifyEmails(apiKey, emails) {
  const results = new Map()
  if (emails.length === 0) return results

  const BATCH_SIZE = 25
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE)
    const batchResults = await classifyBatch(apiKey, batch)
    for (const [id, data] of batchResults) {
      results.set(id, data)
    }
  }
  return results
}

async function classifyBatch(apiKey, emails) {
  const emailList = emails
    .map((e) =>
      `ID: ${e.id}\nFrom: ${e.senderName} <${e.senderEmail}>\nSubject: ${e.subject}\nSnippet: ${e.snippet.slice(0, 120)}`
    )
    .join('\n\n---\n\n')

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: emailList }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `Anthropic API error ${res.status}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text ?? '[]'

  let parsed
  try {
    // Strip markdown code fences if present
    const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    console.error('Failed to parse classification response:', text)
    // Fall back: mark all as 'other'
    parsed = emails.map((e) => ({ id: e.id, category: 'other', reason: 'parse error' }))
  }

  const results = new Map()
  for (const item of parsed) {
    results.set(item.id, {
      category: item.category in CATEGORIES ? item.category : 'other',
      reason: item.reason ?? '',
    })
  }
  return results
}
