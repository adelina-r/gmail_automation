import { useState } from 'react'
import { CATEGORIES } from '../lib/anthropic.js'
import { formatDate } from '../lib/utils.js'

export default function CleanupQueue({ emails, classifications, stagedChanges, onApprove, onSkip, onApproveAll }) {
  const [collapsed, setCollapsed] = useState(false)

  const pending = stagedChanges.filter(
    (c) => c.status === 'pending' && emails.some((e) => e.id === c.emailId)
  )

  // Group by sub-category for display
  const byCat = {}
  for (const email of emails) {
    const cls = classifications.get(email.id)
    const cat = cls?.category ?? 'other'
    if (!byCat[cat]) byCat[cat] = []
    byCat[cat].push(email)
  }

  return (
    <section style={styles.section}>
      <div style={styles.header} onClick={() => setCollapsed((v) => !v)}>
        <div style={styles.headerLeft}>
          <span style={styles.emoji}>🗑️</span>
          <span style={styles.name}>Cleanup Queue</span>
          <span style={styles.count}>{emails.length}</span>
          <span style={styles.subtext}>OTPs, promo, newsletters</span>
        </div>
        <div style={styles.headerRight}>
          {pending.length > 0 && (
            <button
              style={styles.deleteAllBtn}
              onClick={(e) => { e.stopPropagation(); onApproveAll(pending) }}
            >
              Delete all ({pending.length})
            </button>
          )}
          <span style={styles.chevron}>{collapsed ? '›' : '⌄'}</span>
        </div>
      </div>

      {!collapsed && (
        <div>
          {Object.entries(byCat).map(([cat, catEmails]) => (
            <div key={cat}>
              <div style={styles.subheader}>
                {CATEGORIES[cat]?.emoji} {CATEGORIES[cat]?.label ?? cat} ({catEmails.length})
              </div>
              {catEmails.map((email) => {
                const change = stagedChanges.find(
                  (c) => c.emailId === email.id && c.status === 'pending'
                )
                return (
                  <div key={email.id} style={styles.row}>
                    <div style={styles.rowMain}>
                      <span style={styles.rowSender}>
                        {email.senderName || email.senderEmail}
                      </span>
                      <span style={styles.rowSubject}>{email.subject}</span>
                    </div>
                    <div style={styles.rowMeta}>
                      <span style={styles.rowDate}>{formatDate(email.dateMs)}</span>
                      {change ? (
                        <div style={styles.rowActions}>
                          <button style={styles.trashBtn} onClick={() => onApprove(change)}>Delete</button>
                          <button style={styles.skipBtn} onClick={() => onSkip(change)}>Keep</button>
                        </div>
                      ) : (
                        <span style={styles.doneTag}>✓</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
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
  deleteAllBtn: {
    padding: '4px 10px',
    background: 'var(--danger)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
  },
  chevron: { fontSize: '16px', color: 'var(--text-muted)' },
  subheader: {
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    background: '#fafafa',
    borderTop: '1px solid var(--border)',
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
  skipBtn: {
    padding: '3px 8px',
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: '11px',
  },
  doneTag: { fontSize: '11px', color: 'var(--success)' },
}
