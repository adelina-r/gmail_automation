import { useState } from 'react'
import { CATEGORIES } from '../lib/anthropic.js'
import { formatDate, actionDoneLabel } from '../lib/utils.js'
import LeaveAsIsMenu from './LeaveAsIsMenu.jsx'
import MoveMenu from './MoveMenu.jsx'

export default function CleanupQueue({ emails, classifications, stagedChanges, onApprove, onExclude, onTrashMany, onExcludeMany, onApproveAll, onMove }) {
  const [collapsed, setCollapsed] = useState(false)
  // Multi-select is the bulk tool for the Cleanup Queue: check rows (or "Select all"),
  // then Apply / Trash / Leave-as-is from the selection bar. This replaced the old
  // global + per-category "Clear all" buttons (too many overlapping disposal controls).
  const [selected, setSelected] = useState(new Set())

  // Group by sub-category for display
  const byCat = {}
  for (const email of emails) {
    const cls = classifications.get(email.id)
    const cat = cls?.category ?? 'other'
    if (!byCat[cat]) byCat[cat] = []
    byCat[cat].push(email)
  }

  // ── Multi-select helpers ─────────────────────────────────────────────────────
  // A row is selectable unless it's already done (approved). Approved rows show ✓.
  const isSelectable = (email) =>
    stagedChanges.find((c) => c.emailId === email.id)?.status !== 'approved'
  const selectableEmails = emails.filter(isSelectable)
  const selectedEmails = selectableEmails.filter((e) => selected.has(e.id))
  const allSelected = selectableEmails.length > 0 && selectableEmails.every((e) => selected.has(e.id))

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleCat(catEmails) {
    const sel = catEmails.filter(isSelectable)
    const allSel = sel.length > 0 && sel.every((e) => selected.has(e.id))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const e of sel) allSel ? next.delete(e.id) : next.add(e.id)
      return next
    })
  }
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableEmails.map((e) => e.id)))
  const clearSel = () => setSelected(new Set())

  // "Apply": run each checked row's own staged action (archive/trash), ignoring the
  // age gate since the user picked these explicitly. Executes immediately.
  function applySelected() {
    const changes = stagedChanges.filter(
      (c) => c.status === 'pending' && selected.has(c.emailId)
    )
    if (changes.length) onApproveAll(changes)
    clearSel()
  }
  // "🗑 Trash": force-trash every checked row regardless of its staged action.
  // onTrashMany stages a manual trash per row AND executes it (see App.handleTrashMany).
  function trashSelected() {
    if (selectedEmails.length) onTrashMany?.(selectedEmails)
    clearSel()
  }
  // "Leave as-is" on the whole selection.
  function leaveSelected(mode, until) {
    if (selectedEmails.length) onExcludeMany?.(selectedEmails, mode, until)
    clearSel()
  }

  return (
    <section style={styles.section}>
      <div style={styles.header} onClick={() => setCollapsed((v) => !v)}>
        <div style={styles.headerLeft}>
          <span style={styles.emoji}>🗑️</span>
          <span style={styles.name}>Cleanup Queue</span>
          <span style={styles.count}>{emails.length}</span>
          <span style={styles.subtext}>OTPs, promo, newsletters, notifications</span>
        </div>
        <div style={styles.headerRight}>
          {!collapsed && selectableEmails.length > 0 && (
            <label style={styles.selectAll} onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                style={styles.checkbox}
              />
              Select all
            </label>
          )}
          <span style={styles.chevron}>{collapsed ? '›' : '⌄'}</span>
        </div>
      </div>

      {!collapsed && selectedEmails.length > 0 && (
        <div style={styles.selBar}>
          <span style={styles.selCount}>{selectedEmails.length} selected</span>
          <button style={styles.selApply} onClick={applySelected}>Apply</button>
          {onTrashMany && (
            <button style={styles.selTrash} onClick={trashSelected}>🗑 Trash</button>
          )}
          {onExcludeMany && <LeaveAsIsMenu size="sm" onExclude={leaveSelected} />}
          <button style={styles.selClear} onClick={clearSel}>Clear</button>
        </div>
      )}

      {!collapsed && (
        <div>
          {Object.entries(byCat).map(([cat, catEmails]) => {
            const catSelectable = catEmails.filter(isSelectable)
            const allCatSelected = catSelectable.length > 0 && catSelectable.every((e) => selected.has(e.id))
            return (
            <div key={cat}>
              <div style={styles.subheader}>
                <span style={styles.subheaderLeft}>
                  {catSelectable.length > 0 && (
                    <input
                      type="checkbox"
                      checked={allCatSelected}
                      onChange={() => toggleCat(catEmails)}
                      title="Select all in this group"
                      style={styles.checkbox}
                    />
                  )}
                  {CATEGORIES[cat]?.emoji} {CATEGORIES[cat]?.label ?? cat} ({catEmails.length})
                </span>
              </div>
              {catEmails.map((email) => {
                const change = stagedChanges.find((c) => c.emailId === email.id)
                const pendingChange = change?.status === 'pending' ? change : null
                const actionLabel = pendingChange?.action === 'archive' ? 'Archive' : 'Delete'
                // Recent age-gated mail: staged for a manual action but kept out of bulk.
                const notBulk = pendingChange?.bulkEligible === false
                return (
                  <div key={email.id} style={styles.row}>
                    {isSelectable(email) ? (
                      <input
                        type="checkbox"
                        checked={selected.has(email.id)}
                        onChange={() => toggle(email.id)}
                        style={styles.checkbox}
                      />
                    ) : (
                      <span style={styles.checkboxSpacer} />
                    )}
                    <div style={styles.rowMain}>
                      <span style={styles.rowSender}>
                        {email.senderName || email.senderEmail}
                      </span>
                      <span style={styles.rowSubject}>{email.subject}</span>
                    </div>
                    <div style={styles.rowMeta}>
                      <span style={styles.rowDate}>{formatDate(email.dateMs)}</span>
                      {pendingChange ? (
                        <div style={styles.rowActions}>
                          {notBulk && <span style={styles.recentTag} title="Recent — review before bulk-trashing">recent</span>}
                          <button style={styles.trashBtn} onClick={() => onApprove(pendingChange)}>{actionLabel}</button>
                          {onMove && (
                            <MoveMenu
                              size="sm"
                              onMove={(cat, scope) => onMove(email, cat, scope)}
                              currentCategory={classifications.get(email.id)?.category}
                              sender={email.senderEmail}
                            />
                          )}
                          <LeaveAsIsMenu size="sm" onExclude={(mode, until) => onExclude(email, mode, until)} />
                        </div>
                      ) : change?.status === 'approved' ? (
                        <span style={styles.doneTag}>{actionDoneLabel(change.action)}</span>
                      ) : (
                        // No staged action: don't imply "done" — let the user move,
                        // snooze, or exclude it instead.
                        <div style={styles.rowActions}>
                          <span style={styles.noActionTag}>No action</span>
                          {onMove && (
                            <MoveMenu
                              size="sm"
                              onMove={(cat, scope) => onMove(email, cat, scope)}
                              currentCategory={classifications.get(email.id)?.category}
                              sender={email.senderEmail}
                            />
                          )}
                          <LeaveAsIsMenu size="sm" onExclude={(mode, until) => onExclude(email, mode, until)} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )})}
        </div>
      )}
    </section>
  )
}

const styles = {
  section: {
    background: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-sm)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    cursor: 'pointer',
    userSelect: 'none',
    background: 'var(--bg)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  emoji: { fontSize: '16px' },
  name: { fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' },
  count: {
    fontSize: '11px',
    fontWeight: 600,
    background: 'var(--border)',
    color: 'var(--text-secondary)',
    borderRadius: '10px',
    padding: '1px 7px',
  },
  subtext: { fontSize: '12px', color: 'var(--text-muted)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  selectAll: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  chevron: { fontSize: '16px', color: 'var(--text-muted)' },
  subheader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    background: '#fafafa',
    borderTop: '1px solid var(--border)',
  },
  subheaderLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  checkbox: { width: '14px', height: '14px', margin: 0, cursor: 'pointer', flexShrink: 0 },
  checkboxSpacer: { width: '14px', flexShrink: 0 },
  selBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'var(--bg)',
    borderTop: '1px solid var(--border)',
    borderBottom: '1px solid var(--border)',
  },
  selCount: { fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginRight: '2px' },
  selApply: {
    padding: '4px 12px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  selTrash: {
    padding: '4px 10px',
    background: 'var(--danger-light)',
    color: 'var(--danger)',
    border: '1px solid #fca5a5',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  selClear: {
    padding: '4px 10px',
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderBottom: '1px solid var(--border)',
    gap: '12px',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  rowSender: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowSubject: {
    fontSize: '12px',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
  rowDate: { fontSize: '11px', color: 'var(--text-muted)' },
  rowActions: { display: 'flex', gap: '4px' },
  trashBtn: {
    padding: '3px 8px',
    background: 'var(--danger-light)',
    color: 'var(--danger)',
    border: '1px solid #fca5a5',
    borderRadius: 'var(--radius)',
    fontSize: '11px',
    fontWeight: 600,
  },
  doneTag: { fontSize: '11px', color: 'var(--success)' },
  noActionTag: { fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' },
  recentTag: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '1px 6px',
  },
}
