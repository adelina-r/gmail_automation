import CategorySection from './CategorySection.jsx'
import CleanupQueue from './CleanupQueue.jsx'
import { CATEGORIES, CLEANUP_CATEGORIES } from '../lib/anthropic.js'

// Categories shown as full sections (not cleanup), in display order.
// Time-sensitive buckets (scheduling, shipping) sit near the top; cleanup
// categories (otp/promotional/newsletter/statement_notice) are handled separately.
const DIGEST_CATEGORIES = [
  'action_needed',
  'scheduling_reminders',
  'shipping_orders',
  'insurance',
  'medical_billing',
  'financial',
  'travel',
  'school',
  'keep',
]

export default function InboxDigest({
  emails,
  classifications,
  stagedChanges,
  onApprove,
  onSkip,
  onApproveAll,
  onRefresh,
  loading,
  onSignOut,
}) {
  // Group emails by classification
  const grouped = {}
  const cleanupEmails = []

  for (const email of emails) {
    const cls = classifications.get(email.id)
    const cat = cls?.category ?? 'other'
    if (CLEANUP_CATEGORIES.has(cat)) {
      cleanupEmails.push(email)
    } else {
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(email)
    }
  }

  // Sort action_needed emails to top; sort others by most recent
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => b.dateMs - a.dateMs)
  }
  cleanupEmails.sort((a, b) => b.dateMs - a.dateMs)

  const pendingCount = stagedChanges.filter((c) => c.status === 'pending').length

  const orderedCats = [
    'action_needed',
    ...DIGEST_CATEGORIES.filter((c) => c !== 'action_needed' && grouped[c]?.length),
    ...Object.keys(grouped).filter((c) => !DIGEST_CATEGORIES.includes(c) && grouped[c]?.length),
  ].filter((c) => grouped[c]?.length)

  return (
    <div style={styles.layout}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>📧</span>
          <span style={styles.title}>Inbox</span>
          {emails.length > 0 && (
            <span style={styles.emailCount}>{emails.length} emails</span>
          )}
        </div>
        <div style={styles.headerRight}>
          {pendingCount > 0 && (
            <span style={styles.pendingBadge}>{pendingCount} pending</span>
          )}
          <button
            style={{ ...styles.headerBtn, opacity: loading ? 0.6 : 1 }}
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
          <button style={{ ...styles.headerBtn, ...styles.signOutBtn }} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {/* Content */}
      <main style={styles.main}>
        {loading && emails.length === 0 ? (
          <div style={styles.loadingState}>
            <div style={styles.spinner} />
            <p>Fetching and classifying your emails…</p>
            <p style={styles.loadingHint}>This takes about 10–15 seconds on first load.</p>
          </div>
        ) : emails.length === 0 ? (
          <div style={styles.emptyState}>
            <span style={{ fontSize: 32 }}>🎉</span>
            <p>Your inbox looks clean!</p>
            <button style={styles.refreshBtn} onClick={onRefresh}>Refresh</button>
          </div>
        ) : (
          <div style={styles.sections}>
            {orderedCats.map((cat) => (
              <CategorySection
                key={cat}
                category={CATEGORIES[cat] ?? { label: cat, emoji: '📬', color: '#6b7280', bg: '#f9fafb' }}
                emails={grouped[cat]}
                classifications={classifications}
                stagedChanges={stagedChanges.filter(
                  (c) => grouped[cat]?.some((e) => e.id === c.emailId)
                )}
                onApprove={onApprove}
                onSkip={onSkip}
                onApproveAll={onApproveAll}
              />
            ))}

            {cleanupEmails.length > 0 && (
              <CleanupQueue
                emails={cleanupEmails}
                classifications={classifications}
                stagedChanges={stagedChanges.filter((c) =>
                  cleanupEmails.some((e) => e.id === c.emailId)
                )}
                onApprove={onApprove}
                onSkip={onSkip}
                onApproveAll={onApproveAll}
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}

const styles = {
  layout: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    padding: '0 24px',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: 'var(--shadow-sm)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  logo: { fontSize: '20px' },
  title: { fontSize: '16px', fontWeight: 700 },
  emailCount: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '2px 8px',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  pendingBadge: {
    fontSize: '12px',
    fontWeight: 600,
    background: 'var(--warning-light)',
    color: 'var(--warning)',
    border: '1px solid #fde68a',
    borderRadius: '10px',
    padding: '2px 10px',
  },
  headerBtn: {
    padding: '6px 12px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--surface)',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  signOutBtn: { color: 'var(--text-muted)', fontSize: '12px' },
  main: { flex: 1, padding: '24px', maxWidth: '860px', margin: '0 auto', width: '100%' },
  sections: { display: 'flex', flexDirection: 'column', gap: '16px' },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    minHeight: '300px',
    color: 'var(--text-secondary)',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingHint: { fontSize: '12px', color: 'var(--text-muted)' },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    minHeight: '300px',
    color: 'var(--text-secondary)',
  },
  refreshBtn: {
    padding: '8px 20px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    fontWeight: 600,
  },
}
