import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { CATEGORIES } from '../lib/anthropic.js'

/**
 * "Move to ▾" dropdown — manually re-categorize an email.
 * Two steps: pick a target category, then pick the scope:
 *   - "Just this email"      → onMove(category, 'message')
 *   - "Always from {sender}" → onMove(category, 'sender')  (learned sender rule)
 *
 * The menu is `position: fixed` and anchored to the trigger's measured rect, so it
 * escapes the surrounding section's `overflow: hidden` (which otherwise clips it).
 * It flips upward when there's more room above and caps its height to the available
 * space (scrolling the 14-category list if needed), so it never gets cut off.
 *
 * `size` ('sm' | 'md') matches the host row's button scale.
 */
export default function MoveMenu({ onMove, currentCategory, sender, size = 'md' }) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(null) // chosen category, awaiting scope
  const [pos, setPos] = useState(null)        // fixed-position style for the menu
  const ref = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) reset()
    }
    // Close when the PAGE scrolls (a fixed menu would detach from its button), but
    // NOT when the menu's own category list scrolls — ignore scrolls inside it.
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
    const spaceBelow = window.innerHeight - r.bottom - margin
    const spaceAbove = r.top - margin
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow
    setPos({
      position: 'fixed',
      right: Math.max(margin, window.innerWidth - r.right),
      maxHeight: Math.max(140, openUp ? spaceAbove : spaceBelow),
      ...(openUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    })
  }, [open, picked])

  function reset() {
    setOpen(false)
    setPicked(null)
    setPos(null)
  }

  function choose(scope) {
    const cat = picked
    reset()
    onMove(cat, scope)
  }

  const trigger = size === 'sm' ? styles.triggerSm : styles.trigger
  const cats = Object.entries(CATEGORIES).filter(([key]) => key !== currentCategory)

  return (
    <div ref={ref} style={styles.wrap}>
      <button ref={triggerRef} style={trigger} onClick={() => setOpen((v) => !v)} title="Move this email to another category">
        Move to ▾
      </button>
      {open && pos && (
        <div style={{ ...styles.menu, ...pos }}>
          {picked === null ? (
            cats.map(([key, c]) => (
              <button key={key} style={styles.item} onClick={() => setPicked(key)}>
                {c.emoji} {c.label}
              </button>
            ))
          ) : (
            <>
              <div style={styles.scopeHead}>
                Move to {CATEGORIES[picked]?.emoji} {CATEGORIES[picked]?.label}
              </div>
              <button style={styles.item} onClick={() => choose('message')}>
                Just this email
              </button>
              {sender && (
                <button style={styles.item} onClick={() => choose('sender')}>
                  Always from <span style={styles.senderText}>{sender}</span>
                </button>
              )}
              <div style={styles.divider} />
              <button style={{ ...styles.item, ...styles.back }} onClick={() => setPicked(null)}>
                ← Back
              </button>
            </>
          )}
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
    // position/top/right/maxHeight are injected at runtime (fixed, anchored to the
    // trigger, flipped up when needed) so the menu escapes ancestor overflow:hidden.
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-md)',
    zIndex: 50,
    minWidth: '180px',
    maxHeight: '320px',
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
    whiteSpace: 'nowrap',
  },
  scopeHead: {
    padding: '6px 10px 4px',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-muted)',
  },
  senderText: { color: 'var(--text-secondary)' },
  divider: { height: '1px', background: 'var(--border)', margin: '3px 0' },
  back: { color: 'var(--text-secondary)' },
}
