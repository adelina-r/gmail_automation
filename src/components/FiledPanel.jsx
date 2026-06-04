import { useState } from 'react'
import { LABEL_RULES } from '../lib/rules.js'

// category → the Gmail label name its rule files under (for display).
const LABEL_BY_CATEGORY = Object.fromEntries(
  LABEL_RULES.map((r) => [r.category, r.label])
)

/**
 * "Already filed (N) ▾" panel — collapsed by default. Lists mail that already
 * carries the Gmail label it would be filed under, so it doesn't clutter the
 * digest every run (there's nothing to approve). Informational only — the mail is
 * already filed in Gmail.
 */
export default function FiledPanel({ emails, classifications }) {
  const [open, setOpen] = useState(false)
  if (!emails || emails.length === 0) return null

  return (
    <div style={styles.wrap}>
      <button style={styles.header} onClick={() => setOpen((v) => !v)}>
        <span style={styles.title}>Already filed ({emails.length})</span>
        <span style={styles.chevron}>{open ? '⌄' : '›'}</span>
      </button>
      {open && (
        <div style={styles.list}>
          {emails.map((email) => {
            const cat = classifications.get(email.id)?.category
            const label = LABEL_BY_CATEGORY[cat]
            return (
              <div key={email.id} style={styles.row}>
                <div style={styles.info}>
                  <span style={styles.sender}>{email.senderName || email.senderEmail}</span>
                  <span style={styles.subject}>{email.subject}</span>
                </div>
                {label && <span style={styles.labelTag}>{label}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  wrap: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-sm)',
    overflow: 'hidden',
  },
  header: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    background: 'var(--bg)',
    border: 'none',
    cursor: 'pointer',
  },
  title: { fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' },
  chevron: { fontSize: '14px', color: 'var(--text-muted)' },
  list: { display: 'flex', flexDirection: 'column' },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderTop: '1px solid var(--border)',
    gap: '12px',
  },
  info: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 },
  sender: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subject: {
    fontSize: '12px',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  labelTag: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '2px 8px',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
}
