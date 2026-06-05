/**
 * Anthropic API client — email classification
 *
 * Uses claude-haiku for speed and cost efficiency.
 * Sends emails in batches to minimize API calls.
 */

import { matchSenderRule, resolveCategory } from './rules.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

export const CATEGORIES = {
  action_needed:        { label: 'Needs Action',   emoji: '⚡', color: '#ef4444', bg: '#fef2f2' },
  insurance:            { label: 'Insurance',      emoji: '🏥', color: '#0ea5e9', bg: '#f0f9ff' },
  medical_billing:      { label: 'HSA / Billing',  emoji: '🧾', color: '#14b8a6', bg: '#f0fdfa' },
  travel:               { label: 'Travel',         emoji: '✈️', color: '#8b5cf6', bg: '#f5f3ff' },
  financial:            { label: 'Financial',      emoji: '💳', color: '#10b981', bg: '#ecfdf5' },
  school:               { label: 'School/Kids',    emoji: '🎒', color: '#f59e0b', bg: '#fffbeb' },
  shipping_orders:      { label: 'Shipping/Orders', emoji: '📦', color: '#d97706', bg: '#fffbeb' },
  scheduling_reminders: { label: 'Scheduling',     emoji: '📅', color: '#7c3aed', bg: '#f5f3ff' },
  keep:                 { label: 'Keep',           emoji: '🔖', color: '#0891b2', bg: '#ecfeff' },
  otp:                  { label: 'OTP / Codes',    emoji: '🔑', color: '#6b7280', bg: '#f9fafb' },
  promotional:          { label: 'Promotional',    emoji: '🛍️', color: '#6b7280', bg: '#f9fafb' },
  newsletter:           { label: 'Newsletter',     emoji: '📰', color: '#6b7280', bg: '#f9fafb' },
  statement_notice:     { label: 'Statements',     emoji: '🗑️', color: '#6b7280', bg: '#f9fafb' },
  notification:         { label: 'Notifications',  emoji: '🔔', color: '#6b7280', bg: '#f9fafb' },
  other:                { label: 'Other',          emoji: '📬', color: '#6b7280', bg: '#f9fafb' },
}

// Categories that get grouped into the "Cleanup Queue" (disposable noise).
// NOTE: shipping_orders & scheduling_reminders are DIGEST categories, not here —
// they file to a label and decay to a staged trash by age/event-date (see rules.js).
export const CLEANUP_CATEGORIES = new Set(['otp', 'promotional', 'newsletter', 'statement_notice', 'notification'])

const SYSTEM_PROMPT = `You are an email classifier for one person, Adelina. For each email, return a JSON classification.

Categories:
- action_needed: ONLY when Adelina must personally DO something — reply, decide by a deadline, or fix a problem (e.g. an overdrawn account, a claim or RSVP with a deadline). Confirmations, receipts, reminders, shipping updates, "statement is ready" notices, and FYIs are NOT action_needed.
- insurance: PROPERTY & CASUALTY insurance ONLY — auto, home, renters, umbrella (e.g. Mercury Insurance). NOT medical/dental/vision health insurance.
- medical_billing: medical, dental, or vision bills, statements, EOBs, copays, and payment receipts (e.g. Sutter Health billing, Midi Health billing, Cigna EOBs). Health insurers like Cigna and Midi Health belong here, NOT in insurance. Appointment confirmations/reminders and "new message/notes in the portal" notices are NOT medical_billing.
- travel: flight, hotel, car rental, travel loyalty programs (Virgin Atlantic, Aer Lingus, Hilton, SAS, etc.)
- financial: bank, credit-card, or investment mail worth keeping that is NOT insurance, medical, or tax — payment confirmations, investment updates, account notices (Barclays, diversificapital, etc.). Keep-worthy.
- school: school newsletters, tutoring, extracurriculars, kids' activities (AoPS, Schoology, dance, sports, etc.)
- shipping_orders: order confirmations, "shipped"/in-transit/"out for delivery" and tracking updates, "card ready to ship", return approvals (UPS, Amazon shipment-tracking, Lands End, Gap orders, Happy Returns, Amex card shipping). Something is still in motion / worth tracking. NOT promotional offers, and NOT a bare "delivered, nothing left to track" confirmation (that's notification).
- scheduling_reminders: appointment confirmations/reminders, meeting or Zoom links, payment reminders, and calendar invites — anything time-bound that becomes useless once its date passes (Apple Genius Bar, Midi "visit booked/rescheduled", upcoming-payment reminders).
- keep: items to retain safely with no action — gift cards, eGift card info, vouchers, codes worth keeping (Cashstar, eGift details).
- otp: one-time passwords, verification codes, password resets, login codes.
- promotional: retail sale emails, discount offers, promotional marketing (Nordstrom, Bloomingdale's, Amazon, Ulta, etc.)
- newsletter: regular reading newsletters the person appears to value (NOT promotional offers).
- statement_notice: low-value "your statement is ready / available to view" notifications with no action and nothing to keep (e.g. a bank "new statement" notice). Disposable noise — distinct from financial, which is keep-worthy.
- notification: FYI/confirmation messages that are good to see once but need no action and shouldn't be kept on file — e.g. "payment received / payment successful", "you signed in from a new device / new login", "your package was delivered", "password changed", "profile/settings updated". They confirm something that ALREADY happened. Boundaries: NOT action_needed (a confirmation is the opposite of a to-do — there's nothing for Adelina to do); NOT otp (a login CODE to type in is otp, but a "new device signed in" ALERT is notification); NOT shipping_orders (an in-transit/"shipped"/"out for delivery"/tracking update is shipping_orders, but a bare "delivered, nothing left to track" confirmation is notification); NOT statement_notice ("your statement is ready to view" is statement_notice, but "payment received/processed" is notification); NOT financial (a bank/credit-card/investment confirmation worth KEEPING for your records — Barclays, diversificapital — stays financial, but a transactional service/app FYI you wouldn't file is notification).
- other: anything that doesn't fit the above — including "new message/notes in your portal" notifications.

Guidance:
- Topical buckets win over scheduling_reminders. If a dated/reminder/confirmation/"info" email clearly belongs to school (a kid's camp, lessons, sports, or activity), travel, insurance, medical_billing, or financial, use THAT category. scheduling_reminders is only for time-bound mail with no topical home — a generic appointment, a meeting/Zoom link, a payment reminder. So a "summer camp reminder" or "camp week 1 info" is school, not scheduling.
- A bill or balance due is medical_billing (if medical) or financial — NOT action_needed just because it mentions paying.
- An appointment "booked/rescheduled/reminder", meeting link, or calendar invite with no topical home is scheduling_reminders, never action_needed or insurance.
- "Your statement is ready" with nothing to keep → statement_notice. Investment/payment mail you'd file → financial.
- eventDate: if the email refers to a specific upcoming appointment, meeting, or event date (mainly scheduling_reminders), return it as eventDate in YYYY-MM-DD. Otherwise null.

Respond with a JSON array (one object per email) in the same order as input:
[{ "id": "<message_id>", "category": "<category>", "reason": "<one short phrase>", "eventDate": "YYYY-MM-DD" | null }, ...]

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

  // Sender rules first — emails with a FORCED category skip the AI entirely
  // (cheaper + deterministic). Everything else goes to the classifier.
  const needsAi = []
  for (const email of emails) {
    const rule = matchSenderRule(email)
    if (rule?.category) {
      results.set(email.id, { category: rule.category, reason: rule.reason })
    } else {
      needsAi.push(email)
    }
  }

  const BATCH_SIZE = 25
  for (let i = 0; i < needsAi.length; i += BATCH_SIZE) {
    const batch = needsAi.slice(i, i + BATCH_SIZE)
    const batchResults = await classifyBatch(apiKey, batch)
    for (const [id, data] of batchResults) {
      // The model occasionally echoes back an id that wasn't in the batch (a
      // hallucinated/garbled id). Ignore those — keying results to a real email id
      // is what matters, and resolveCategory needs a real email for sender rules.
      const email = batch.find((e) => e.id === id)
      if (!email) continue
      // Apply `never` guardrails (e.g. scclc-exchange must not be action_needed).
      const resolved = resolveCategory(email, data.category, data.reason)
      results.set(id, { category: resolved.category, reason: resolved.reason })
    }
    // Back-fill any email the model dropped from its response so every email still
    // gets a classification (downstream code does classifications.get(email.id)).
    for (const email of batch) {
      if (!results.has(email.id)) {
        results.set(email.id, { category: 'other', reason: 'no classification returned' })
      }
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
      max_tokens: 4096,
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

  // If the model ran out of output tokens, the JSON is truncated and will fail to
  // parse. Surface that explicitly instead of silently falling back to "parse error".
  if (data.stop_reason === 'max_tokens') {
    console.warn(
      `Classification response hit max_tokens (batch of ${emails.length}). ` +
      `Output was truncated — raise max_tokens or lower BATCH_SIZE.`
    )
  }

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
      eventDate: normalizeEventDate(item.eventDate),
    })
  }
  return results
}

// Accept only a clean YYYY-MM-DD string; everything else (null, "", "none",
// malformed) becomes null so downstream decay logic can rely on it.
function normalizeEventDate(value) {
  if (typeof value !== 'string') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null
}
