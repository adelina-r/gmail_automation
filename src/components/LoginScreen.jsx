import { useState } from 'react'

export default function LoginScreen({ onConnect, clientId, onClientIdChange }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('anthropic_key') ?? '')
  const [showApiKey, setShowApiKey] = useState(false)
  const [localClientId, setLocalClientId] = useState(clientId)

  function handleSaveKeys() {
    if (apiKey) localStorage.setItem('anthropic_key', apiKey)
    if (localClientId) onClientIdChange(localClientId)
  }

  const ready = apiKey.length > 0 && localClientId.length > 0

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>📧</div>
        <h1 style={styles.title}>Gmail Automation</h1>
        <p style={styles.subtitle}>
          Connect your Gmail and Anthropic API key to get started.
          Your data never leaves your browser.
        </p>

        <div style={styles.fields}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="client-id">
              Google OAuth Client ID
            </label>
            <input
              id="client-id"
              style={styles.input}
              type="text"
              placeholder="123456789-abc.apps.googleusercontent.com"
              value={localClientId}
              onChange={(e) => setLocalClientId(e.target.value)}
            />
            <p style={styles.hint}>
              From Google Cloud Console → APIs &amp; Services → Credentials
            </p>
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="api-key">
              Anthropic API Key
            </label>
            <div style={styles.inputRow}>
              <input
                id="api-key"
                style={{ ...styles.input, flex: 1 }}
                type={showApiKey ? 'text' : 'password'}
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button
                style={styles.toggleBtn}
                onClick={() => setShowApiKey((v) => !v)}
                type="button"
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p style={styles.hint}>
              Stored in your browser's localStorage. Moves server-side in Phase 3.
            </p>
          </div>
        </div>

        <button
          style={{ ...styles.connectBtn, opacity: ready ? 1 : 0.5 }}
          disabled={!ready}
          onClick={() => { handleSaveKeys(); onConnect() }}
        >
          Connect Gmail
        </button>

        {!ready && (
          <p style={styles.notice}>Fill in both fields above to continue.</p>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'var(--bg)',
  },
  card: {
    background: 'var(--surface)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-md)',
    padding: '40px',
    width: '100%',
    maxWidth: '460px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
  },
  logo: { fontSize: '40px' },
  title: { fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
    lineHeight: 1.6,
  },
  fields: { width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' },
  input: {
    padding: '10px 12px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    outline: 'none',
    transition: 'border-color 0.15s',
    width: '100%',
  },
  inputRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  toggleBtn: {
    padding: '10px 14px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--bg)',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
  },
  hint: { fontSize: '12px', color: 'var(--text-muted)' },
  connectBtn: {
    width: '100%',
    padding: '12px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'background 0.15s, opacity 0.15s',
  },
  notice: { fontSize: '12px', color: 'var(--text-muted)' },
}
