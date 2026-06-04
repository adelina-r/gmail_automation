/**
 * Approval-first "create new Gmail labels" banner.
 *
 * Some label rules target labels that don't exist in the user's Gmail yet
 * (`financial`, `keep`, `Shipping & Pending Orders`, `Scheduling & Reminders`).
 * Rather than silently auto-creating them on first execute, `generateStagedChanges`
 * stages a one-time `create-label` change per missing label; this banner surfaces
 * them with explicit Create / Create all buttons. It disappears once they're all
 * approved (created). Labeling those emails will error until the label exists, so
 * this must be acted on first — hence it renders at the top of the digest.
 */
export default function NewLabelsBanner({ changes, onApprove, onApproveAll }) {
  const pending = changes.filter((c) => c.status === 'pending')
  if (pending.length === 0) return null

  return (
    <section style={styles.banner}>
      <div style={styles.top}>
        <span style={styles.emoji}>🏷️</span>
        <div style={styles.text}>
          <div style={styles.title}>
            Create {pending.length} new Gmail label{pending.length > 1 ? 's' : ''}?
          </div>
          <div style={styles.sub}>
            These don't exist in your Gmail yet. Labeling below needs them — approve to
            create them first (nothing is created automatically).
          </div>
        </div>
        <button style={styles.createAll} onClick={() => onApproveAll(pending)}>
          Create all
        </button>
      </div>
      <div style={styles.chips}>
        {pending.map((c) => (
          <span key={c.id} style={styles.chip}>
            <span style={styles.chipName}>{c.label}</span>
            <button style={styles.chipBtn} onClick={() => onApprove(c)} title={`Create "${c.label}"`}>
              Create
            </button>
          </span>
        ))}
      </div>
    </section>
  )
}

const styles = {
  banner: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 'var(--radius-lg)',
    padding: '14px 16px',
    boxShadow: 'var(--shadow-sm)',
  },
  top: { display: 'flex', alignItems: 'flex-start', gap: '10px' },
  emoji: { fontSize: '18px', lineHeight: '20px' },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: '13px', fontWeight: 700, color: '#1e3a8a' },
  sub: { fontSize: '12px', color: '#1d4ed8', marginTop: '2px' },
  createAll: {
    flexShrink: 0,
    padding: '6px 12px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--surface)',
    border: '1px solid #bfdbfe',
    borderRadius: '999px',
    padding: '3px 4px 3px 10px',
    fontSize: '12px',
    color: 'var(--text-primary)',
  },
  chipName: { fontWeight: 600 },
  chipBtn: {
    padding: '2px 8px',
    background: '#dbeafe',
    color: '#1d4ed8',
    border: 'none',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
