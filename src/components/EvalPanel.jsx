import { CATEGORIES } from '../lib/anthropic.js'

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—')
const catLabel = (c) => CATEGORIES[c]?.label ?? c

/**
 * Ground-truth accuracy results overlay.
 * Shows per-category accuracy split into AI-only vs rule-decided, plus misses.
 */
export default function EvalPanel({ state, onClose }) {
  if (!state.open) return null
  const { loading, error, report } = state

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>📊 Accuracy vs. your labels</span>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        {loading && <p style={styles.muted}>Fetching labeled mail and classifying… this spends a little API budget.</p>}
        {error && <p style={styles.error}>⚠️ {error}</p>}

        {report && (
          <>
            <p style={styles.headline}>
              AI-only accuracy{' '}
              <strong>{pct(report.totals.aiCorrect, report.totals.aiTotal)}</strong>{' '}
              <span style={styles.muted}>({report.totals.aiCorrect}/{report.totals.aiTotal})</span>
              <span style={styles.dim}> · overall {pct(report.totals.correct, report.totals.total)} incl. sender rules</span>
            </p>

            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Label → expected</th>
                  <th style={styles.thNum}>n</th>
                  <th style={styles.thNum}>AI-only</th>
                  <th style={styles.thNum}>rule</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(report.perCategory).map((s) => (
                  <tr key={s.label}>
                    <td style={styles.td}>{s.label} → {catLabel(s.expected)}</td>
                    <td style={styles.tdNum}>{s.total}</td>
                    <td style={styles.tdNum}>
                      {pct(s.aiCorrect, s.aiTotal)} <span style={styles.dim}>({s.aiCorrect}/{s.aiTotal})</span>
                    </td>
                    <td style={styles.tdNum}>
                      {pct(s.ruleCorrect, s.ruleTotal)} <span style={styles.dim}>({s.ruleCorrect}/{s.ruleTotal})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={styles.note}>
              <strong>AI-only</strong> = mail the model classified. <strong>rule</strong> = sender-bypassed
              (correct by construction; excluded from the AI score so it isn't inflated).
            </p>

            {report.misses.length > 0 && (
              <details style={styles.details}>
                <summary style={styles.summary}>{report.misses.length} misses</summary>
                <ul style={styles.missList}>
                  {report.misses.map((m, i) => (
                    <li key={i} style={styles.missItem}>
                      <span style={styles.dim}>[{m.decidedBy}]</span> expected{' '}
                      <strong>{catLabel(m.expected)}</strong>, got <strong>{catLabel(m.predicted)}</strong>
                      <div style={styles.missSubject}>{m.subject} — {m.senderEmail}</div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16,
  },
  card: {
    background: '#fff', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)',
    maxWidth: 620, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 20,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 16, fontWeight: 700 },
  close: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#6b7280' },
  headline: { fontSize: 14, margin: '8px 0 12px' },
  muted: { color: '#6b7280', fontSize: 13 },
  dim: { color: '#9ca3af', fontWeight: 400, fontSize: 12 },
  error: { color: '#b91c1c', fontSize: 13 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontWeight: 600 },
  thNum: { textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontWeight: 600 },
  td: { padding: '6px 8px', borderBottom: '1px solid #f3f4f6' },
  tdNum: { padding: '6px 8px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' },
  note: { fontSize: 12, color: '#6b7280', margin: '12px 0' },
  details: { marginTop: 8 },
  summary: { cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  missList: { margin: '8px 0 0', paddingLeft: 18 },
  missItem: { fontSize: 13, marginBottom: 8 },
  missSubject: { color: '#6b7280', fontSize: 12 },
}
