/**
 * Format a timestamp (ms) into a human-readable date string.
 */
export function formatDate(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  const diffMs = now - d
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/**
 * Past-tense "done" marker for an approved staged change, so the UI says WHAT
 * happened (archive ≠ delete) instead of a generic "Done".
 */
export function actionDoneLabel(action) {
  switch (action) {
    case 'trash': return '✓ Trashed'
    case 'archive': return '✓ Archived'
    case 'label': return '✓ Filed'
    case 'create-label': return '✓ Created'
    default: return '✓ Done'
  }
}
