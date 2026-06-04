import { useState } from 'react'

/**
 * "Excluded (N) ▾" panel — lists active exclusions with a Remove (undo) button
 * each, so "Forever" is never a one-way door. Collapsed by default.
 */
export default function ExcludedPanel({ exclusions, onRemove }) {
  const [open, setOpen] = useState(false)
  if (!exclusions || exclusions.length === 0) return null

  return (
    <div style={styles.wrap}>
      <button style={styles.header} onClick={() => setOpen((v) => !v)}>
        <span style={styles.title}>Excluded ({exclusions.length})</span>
        <span style={styles.chevron}>{open ? '⌄' : '›'}</span>
      </button>
      {open && (
        <div style={styles.list}>
          {exclusions.map((ex) => (
            <div key={ex.id} style={styles.row}>
              <div style={styles.info}>
                <span style={styles.target}>{describeTarget(ex.target)}</span>
                <span style={styles.mode}>{describeMode(ex)}</span>
              </div>
              <button style={styles.removeBtn} onClick={() => onRemove(ex.id)} title="Undo — start staging this again">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function describeTarget(target) {
  if (!target) return 'Unknown'
  switch (target.type) {
    case 'message':
      return target.label ?? 'This email'
    case 'sender':
      return `All from ${target.value}`
    case 'senderSubject':
      return `${target.value?.sender ?? ''} about “${target.value?.keyword ?? ''}”`
    default:
      return target.type
  }
}

function describeMode(ex) {
  if (ex.mode === 'forever') return 'forever'
  if (!ex.until) return 'snoozed'
  const d = new Date(ex.until)
  if (Number.isNaN(d.getTime())) return 'snoozed'
  return `until ${d.toLocaleDateString()}`
}

const styles = {
  wrap: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-sm)',
    marginBottom: '16px',
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
  target: {
    fontSize: '12px',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  mode: { fontSize: '11px', color: 'var(--text-muted)' },
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
