import { formatDate } from '../lib/utils.js'
import LeaveAsIsMenu from './LeaveAsIsMenu.jsx'
import MoveMenu from './MoveMenu.jsx'

export default function EmailCard({ email, classification, action, onApprove, onExclude, onMove }) {
  return (
    <div style={styles.card}>
      <div style={styles.main}>
        <div style={styles.meta}>
          <span style={styles.sender}>
            {email.senderName || email.senderEmail}
          </span>
          <span style={styles.date}>{formatDate(email.dateMs)}</span>
        </div>
        <div style={styles.subject}>{email.subject}</div>
        {email.snippet && (
          <div style={styles.snippet}>{email.snippet.slice(0, 100)}{email.snippet.length > 100 ? '…' : ''}</div>
        )}
        {classification?.reason && (
          <div style={styles.reason}>{classification.reason}</div>
        )}
      </div>

      <div style={styles.actions}>
        {action && (
          <button style={styles.approveBtn} onClick={() => onApprove(email.id)}>
            {action.action === 'label' ? `Label: ${action.label}` :
             action.action === 'trash' ? 'Delete' :
             action.action === 'archive' ? 'Archive' : 'Apply'}
          </button>
        )}
        {onMove && (
          <MoveMenu
            onMove={(cat, scope) => onMove(email, cat, scope)}
            currentCategory={classification?.category}
            sender={email.senderEmail}
          />
        )}
        <LeaveAsIsMenu onExclude={(mode, until) => onExclude(email, mode, until)} />
      </div>
    </div>
  )
}

const styles = {
  card: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    transition: 'background 0.1s',
  },
  main: { flex: 1, minWidth: 0 },
  meta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2px',
  },
  sender: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '240px',
  },
  date: { fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' },
  subject: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginBottom: '2px',
  },
  snippet: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  reason: {
    marginTop: '4px',
    fontSize: '11px',
    color: 'var(--accent)',
    fontStyle: 'italic',
  },
  actions: { display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 },
  approveBtn: {
    padding: '5px 12px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '12px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
}
