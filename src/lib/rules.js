/**
 * Rule definitions — mirrors the rules approved by Adelina in Phase 1.
 * Each rule maps a classification category (or sender pattern) to a suggested action.
 *
 * These are used to auto-generate staged changes after classification.
 */

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
    id: 'travel-label',
    name: 'Label travel emails',
    category: 'travel',
    action: 'label',
    label: 'travel',
    enabled: true,
  },
  {
    id: 'finance-label',
    name: 'Label finance emails',
    category: 'finance',
    action: 'label',
    label: 'finance',
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
]

export const CLEANUP_RULES = [
  {
    id: 'otp-trash',
    name: 'Delete OTP/verification emails',
    category: 'otp',
    action: 'trash',
    enabled: true,
  },
]

/**
 * Generate staged changes from classified emails.
 *
 * @param {Array} emails - parsed email objects
 * @param {Map} classifications - Map<id, {category, reason}>
 * @returns {{ labelChanges: StagedChange[], cleanupChanges: StagedChange[] }}
 */
export function generateStagedChanges(emails, classifications) {
  const labelChanges = []
  const cleanupChanges = []

  for (const email of emails) {
    const cls = classifications.get(email.id)
    if (!cls) continue

    // Check label rules
    for (const rule of LABEL_RULES) {
      if (!rule.enabled) continue
      if (cls.category !== rule.category) continue
      // Don't re-label if already has this label
      const alreadyLabeled = email.labelIds.some(
        (id) => id.toLowerCase().includes(rule.label.toLowerCase())
      )
      if (alreadyLabeled) continue

      labelChanges.push({
        id: `${rule.id}-${email.id}`,
        ruleId: rule.id,
        emailId: email.id,
        subject: email.subject,
        senderName: email.senderName,
        senderEmail: email.senderEmail,
        date: email.date,
        dateMs: email.dateMs,
        action: 'label',
        label: rule.label,
        reason: cls.reason,
        status: 'pending',
      })
    }

    // Check cleanup rules
    for (const rule of CLEANUP_RULES) {
      if (!rule.enabled) continue
      if (cls.category !== rule.category) continue

      cleanupChanges.push({
        id: `${rule.id}-${email.id}`,
        ruleId: rule.id,
        emailId: email.id,
        subject: email.subject,
        senderName: email.senderName,
        senderEmail: email.senderEmail,
        date: email.date,
        dateMs: email.dateMs,
        action: rule.action,
        label: null,
        reason: cls.reason,
        status: 'pending',
      })
    }
  }

  return { labelChanges, cleanupChanges }
}
