import { useState, useRef, useEffect, useLayoutEffect } from 'react'

const DAY_MS = 86400000

/**
 * "Leave as-is ▾" dropdown — replaces the old session-only Skip.
 * Calls onExclude(mode, until):
 *   - 1 week / 1 month  → mode 'until', until = ISO end-of-window
 *   - Pick a date…      → mode 'until', until = ISO end of chosen day
 *   - Forever           → mode 'forever', until = null
 *
 * The menu is `position: fixed` and anchored to the trigger's measured rect, so it
 * escapes the surrounding section's `overflow: hidden` (which otherwise clipped it
 * on the bottom row of a box). It flips upward when there's more room above and caps
 * its height to the available space — same approach as MoveMenu.
 *
 * `size` ('sm' | 'md') matches the host row's button scale.
 */
export default function LeaveAsIsMenu({ onExclude, size = 'md' }) {
  const [open, setOpen] = useState(false)
  const [pickingDate, setPickingDate] = useState(false)
  const [pos, setPos] = useState(null) // fixed-position style for the menu
  const ref = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) reset()
    }
    // Close when the PAGE scrolls (a fixed menu would detach from its button), but
    // NOT when interacting inside the menu itself.
    function onScroll(e) {
      if (ref.current && e.target && ref.current.contains(e.target)) return
      reset()
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', reset)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', reset)
    }
  }, [open])

  // Position the menu next to the trigger, flipping up / capping height to fit.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const margin = 8
    const desired = 200 // approx menu height (4 items + divider, or the date input)
    const spaceBelow = window.innerHeight - r.bottom - margin
    const spaceAbove = r.top - margin
    const openUp = spaceBelow < desired && spaceAbove > spaceBelow
    setPos({
      position: 'fixed',
      right: Math.max(margin, window.innerWidth - r.right),
      maxHeight: Math.max(140, openUp ? spaceAbove : spaceBelow),
      ...(openUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    })
  }, [open, pickingDate])

  function reset() {
    setOpen(false)
    setPickingDate(false)
    setPos(null)
  }

  function choose(mode, until) {
    reset()
    onExclude(mode, until)
  }

  const isoIn = (days) => new Date(Date.now() + days * DAY_MS).toISOString()
  const trigger = size === 'sm' ? styles.triggerSm : styles.trigger

  return (
    <div ref={ref} style={styles.wrap}>
      <button ref={triggerRef} style={trigger} onClick={() => setOpen((v) => !v)} title="Stop staging changes for this email">
        Leave as-is ▾
      </button>
      {open && pos && (
        <div style={{ ...styles.menu, ...pos }}>
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
    // position/top/bottom/right/maxHeight are injected at runtime (fixed, anchored to
    // the trigger, flipped up when needed) so the menu escapes ancestor overflow:hidden.
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-md)',
    zIndex: 50,
    minWidth: '140px',
    overflowY: 'auto',
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
