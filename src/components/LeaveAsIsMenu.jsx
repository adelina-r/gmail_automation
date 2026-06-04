import { useState, useRef, useEffect } from 'react'

const DAY_MS = 86400000

/**
 * "Leave as-is ▾" dropdown — replaces the old session-only Skip.
 * Calls onExclude(mode, until):
 *   - 1 week / 1 month  → mode 'until', until = ISO end-of-window
 *   - Pick a date…      → mode 'until', until = ISO end of chosen day
 *   - Forever           → mode 'forever', until = null
 *
 * `size` ('sm' | 'md') matches the host row's button scale.
 */
export default function LeaveAsIsMenu({ onExclude, size = 'md' }) {
  const [open, setOpen] = useState(false)
  const [pickingDate, setPickingDate] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setPickingDate(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function choose(mode, until) {
    setOpen(false)
    setPickingDate(false)
    onExclude(mode, until)
  }

  const isoIn = (days) => new Date(Date.now() + days * DAY_MS).toISOString()
  const trigger = size === 'sm' ? styles.triggerSm : styles.trigger

  return (
    <div ref={ref} style={styles.wrap}>
      <button style={trigger} onClick={() => setOpen((v) => !v)} title="Stop staging changes for this email">
        Leave as-is ▾
      </button>
      {open && (
        <div style={styles.menu}>
          <button style={styles.item} onClick={() => choose('until', isoIn(7))}>1 week</button>
          <button style={styles.item} onClick={() => choose('until', isoIn(30))}>1 month</button>
          {pickingDate ? (
            <input
              type="date"
              style={styles.dateInput}
              autoFocus
              onChange={(e) => {
                if (!e.target.value) return
                choose('until', new Date(`${e.target.value}T23:59:59`).toISOString())
              }}
            />
          ) : (
            <button style={styles.item} onClick={() => setPickingDate(true)}>Pick a date…</button>
          )}
          <div style={styles.divider} />
          <button style={{ ...styles.item, ...styles.forever }} onClick={() => choose('forever', null)}>
            Forever
          </button>
        </div>
      )}
    </div>
  )
}

const baseTrigger = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const styles = {
  wrap: { position: 'relative' },
  trigger: { ...baseTrigger, padding: '5px 12px', fontSize: '12px' },
  triggerSm: { ...baseTrigger, padding: '3px 8px', fontSize: '11px', color: 'var(--text-muted)' },
  menu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '4px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-md)',
    zIndex: 50,
    minWidth: '140px',
    padding: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  item: {
    textAlign: 'left',
    padding: '6px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    width: '100%',
  },
  forever: { color: 'var(--text-secondary)' },
  divider: { height: '1px', background: 'var(--border)', margin: '3px 0' },
  dateInput: {
    padding: '5px 8px',
    fontSize: '12px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    width: '100%',
  },
}
