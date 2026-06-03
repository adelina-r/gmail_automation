/**
 * Ground-truth accuracy eval.
 *
 * Adelina's existing Gmail labels are human-applied ground truth. This pulls a
 * sample of already-labeled mail, runs it through the SAME classify pipeline the
 * app uses, and scores the prediction against the label she assigned.
 *
 * Two honesty guards (see categorization-feedback.md recon, 2026-06-03):
 *  - Exclude her own SENT messages / forwards — they aren't inbound mail to classify.
 *  - Split RULE-decided (sender-bypassed, correct by construction) from AI-decided,
 *    so the AI's real accuracy isn't inflated by the hardcoded sender rules.
 */

import { fetchEmailsByQuery } from './gmail.js'
import { classifyEmails } from './anthropic.js'
import { matchSenderRule } from './rules.js'

// Gmail label name → expected classifier category.
// Start with the four labels that map cleanly; expand as mappings firm up.
export const GROUND_TRUTH = {
  insurance: 'insurance',
  'HSA Tracking': 'medical_billing',
  travel: 'travel',
  'child care': 'school',
}

function labelQuery(label) {
  // -in:sent/-in:draft/-in:trash keeps her forwards and drafts out of the sample.
  return `label:"${label}" -in:sent -in:draft -in:trash`
}

/**
 * Run the eval. Returns { perCategory, misses, totals }.
 * @param {string} token  Gmail access token
 * @param {string} apiKey Anthropic API key
 * @param {{perLabel?: number}} opts
 */
export async function runLabelEval(token, apiKey, { perLabel = 15 } = {}) {
  const perCategory = {}
  const misses = []

  for (const [label, expected] of Object.entries(GROUND_TRUTH)) {
    // Over-fetch, then drop any SENT/DRAFT that slipped through, then cap.
    let emails = await fetchEmailsByQuery(token, labelQuery(label), perLabel * 2)
    emails = emails
      .filter((e) => !e.labelIds.includes('SENT') && !e.labelIds.includes('DRAFT'))
      .slice(0, perLabel)

    const cls = await classifyEmails(apiKey, emails)

    const stat = (perCategory[label] = {
      label,
      expected,
      total: 0,
      correct: 0,
      ruleTotal: 0,
      ruleCorrect: 0,
      aiTotal: 0,
      aiCorrect: 0,
      byPrediction: {},
    })

    for (const e of emails) {
      const predicted = cls.get(e.id)?.category ?? 'other'
      const ruleDecided = Boolean(matchSenderRule(e)?.category) // forced category = bypassed AI
      const ok = predicted === expected

      stat.total++
      if (ok) stat.correct++
      if (ruleDecided) {
        stat.ruleTotal++
        if (ok) stat.ruleCorrect++
      } else {
        stat.aiTotal++
        if (ok) stat.aiCorrect++
      }
      stat.byPrediction[predicted] = (stat.byPrediction[predicted] ?? 0) + 1

      if (!ok) {
        misses.push({
          label,
          expected,
          predicted,
          decidedBy: ruleDecided ? 'rule' : 'ai',
          subject: e.subject,
          senderEmail: e.senderEmail,
        })
      }
    }
  }

  // Roll up overall + AI-only totals across categories.
  const totals = Object.values(perCategory).reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      correct: acc.correct + s.correct,
      aiTotal: acc.aiTotal + s.aiTotal,
      aiCorrect: acc.aiCorrect + s.aiCorrect,
    }),
    { total: 0, correct: 0, aiTotal: 0, aiCorrect: 0 }
  )

  return { perCategory, misses, totals }
}
