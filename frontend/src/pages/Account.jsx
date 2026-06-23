import Nav from '../components/Nav.jsx'
import { useAuth } from '../hooks/useAuth.js'

export default function Account() {
  const { user, signOut } = useAuth()

  const infoRows = [
    { label: 'Email', value: user?.email || '—' },
    { label: 'Auth', value: 'Google (via Supabase)' },
    { label: 'Database', value: 'Supabase PostgreSQL' },
  ]

  return (
    <div className="app-shell">
      <Nav />
      <main className="page-main">
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>

          <header style={s.header}>
            <h1 style={s.h1}>Account</h1>
            <p style={s.sub}>Signed in as {user?.email || 'unknown'}</p>
          </header>

          <div style={s.card}>
            <div style={s.cardTitle}>Account info</div>
            {infoRows.map(({ label, value }) => (
              <div key={label} style={s.row}>
                <span style={s.rowLabel}>{label}</span>
                <span style={s.rowValue}>{value}</span>
              </div>
            ))}
          </div>

          <button style={s.signOutBtn} onClick={signOut}>
            Sign out
          </button>

        </div>
      </main>
    </div>
  )
}

const s = {
  header: { marginBottom: 'var(--space-8)' },
  h1: {
    fontFamily: 'var(--font-heading)',
    fontSize: '26px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '-0.02em',
    marginBottom: 'var(--space-1)',
  },
  sub: { fontSize: '14px', color: 'var(--color-text-3)' },
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-5)',
    marginBottom: 'var(--space-6)',
  },
  cardTitle: {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: 'var(--color-text-3)',
    marginBottom: 'var(--space-4)',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-3) 0',
    borderBottom: '1px solid var(--color-border-subtle)',
    fontSize: '14px',
  },
  rowLabel: { fontWeight: 500, color: 'var(--color-text-2)' },
  rowValue: { color: 'var(--color-text-3)' },
  signOutBtn: {
    background: 'none',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    padding: '9px var(--space-5)',
    fontSize: '13.5px',
    fontWeight: 600,
    color: 'var(--color-error)',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
  },
}
