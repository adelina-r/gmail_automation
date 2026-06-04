import { useState } from 'react'
import { CATEGORIES } from '../lib/anthropic.js'

/**
 * "Learned rules (N) ▾" panel — lists sender-level corrections the user created
 * via "Move to → Always from {sender}", each with a Remove (undo) button so the
 * "always" promise is never a one-way door. Collapsed by default. Previews the
 * future Rules Manager (tracker 2.9).
 */
export default function LearnedRulesPanel({ rules, onRemove }) {
  const [open, setOpen] = useState(false)
  if (!rules || rules.length === 0) return null

  return (
    <div style={styles.wrap}>
      <button style={styles.header} onClick={() => setOpen((v) => !v)}>
        <span style={styles.title}>Learned rules ({rules.length})</span>
        <span style={styles.chevron}>{open ? '⌄' : '›'}</span>
      </button>
      {open && (
        <div style={styles.list}>
          {rules.map((r) => (
            <div key={r.id} style={styles.row}>
              <div style={styles.info}>
                <span style={styles.rule}>
                  All from <strong>{r.sender}</strong> → {CATEGORIES[r.to]?.emoji} {CATEGORIES[r.to]?.label ?? r.to}
                </span>
              </div>
              <button style={styles.removeBtn} onClick={() => onRemove(r.id)} title="Undo — stop forcing this sender's category">
                Remove
              </button>
            </div>
          ))}
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
  rule: {
    fontSize: '12px',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  removeBtn: {
    padding: '3px 10px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: '11px',
    cursor: 'pointer',
    flexShrink: 0,
  },
}
