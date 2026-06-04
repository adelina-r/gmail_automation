import { useState } from 'react'
import EmailCard from './EmailCard.jsx'

export default function CategorySection({
  category,
  emails,
  classifications,
  stagedChanges,
  onApprove,
  onExclude,
  onApproveAll,
  onMove,
}) {
  const [collapsed, setCollapsed] = useState(false)

  const pendingChanges = stagedChanges.filter(
    (c) => c.status === 'pending' && emails.some((e) => e.id === c.emailId)
  )

  return (
    <section style={styles.section}>
      <div style={styles.header} onClick={() => setCollapsed((v) => !v)}>
        <div style={styles.headerLeft}>
          <span style={styles.emoji}>{category.emoji}</span>
          <span style={styles.name}>{category.label}</span>
          <span style={styles.count}>{emails.length}</span>
        </div>
        <div style={styles.headerRight}>
          {pendingChanges.length > 0 && (
            <button
              style={styles.approveAllBtn}
              onClick={(e) => { e.stopPropagation(); onApproveAll(pendingChanges) }}
            >
              Apply all ({pendingChanges.length})
            </button>
          )}
          <span style={styles.chevron}>{collapsed ? '›' : '⌄'}</span>
        </div>
      </div>

      {!collapsed && (
        <div style={styles.list}>
          {emails.map((email) => {
            const change = stagedChanges.find(
              (c) => c.emailId === email.id && c.status === 'pending'
            )
            return (
              <EmailCard
                key={email.id}
                email={email}
                classification={classifications.get(email.id)}
                action={change}
                onApprove={() => onApprove(change)}
                onExclude={onExclude}
                onMove={onMove}
              />
            )
          })}
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
    borderBottom: '1px solid var(--border)',
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
  headerRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  approveAllBtn: {
    padding: '4px 10px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
  },
  chevron: { fontSize: '16px', color: 'var(--text-muted)' },
  list: {},
}
