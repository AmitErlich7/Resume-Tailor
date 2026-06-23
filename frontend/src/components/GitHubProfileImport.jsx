import { useState } from 'react'
import { confirmGitHubProject, fetchGitHubProfile, importGitHubRepo } from '../services/api.js'

const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572a5',
  Rust: '#dea584', Go: '#00add8', Java: '#b07219', Ruby: '#701516',
  Swift: '#f05138', Kotlin: '#a97bff', 'C++': '#f34b7d', C: '#555555',
  'C#': '#178600', PHP: '#4f5d95', HTML: '#e34c26', CSS: '#563d7c',
  Shell: '#89e051', Dart: '#00b4ab',
}

function relativeTime(isoStr) {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

export default function GitHubProfileImport({ onClose, onImported }) {
  const [step, setStep] = useState('input')
  const [username, setUsername] = useState('')
  const [repos, setRepos] = useState([])
  const [resolvedUsername, setResolvedUsername] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [cards, setCards] = useState([])
  const [error, setError] = useState(null)
  const [savedCount, setSavedCount] = useState(0)

  const selectedRepos = repos.filter(r => selected.has(r.url))
  const validCards = cards.filter(c => !c.skipped && !c.error && !c.loading)
  const isFetching = step === 'fetching-repos'
  const isSaving = step === 'saving'

  const handleFetch = async () => {
    if (!username.trim()) return
    setError(null)
    setStep('fetching-repos')
    try {
      const result = await fetchGitHubProfile(username.trim())
      setRepos(result.repos)
      setResolvedUsername(result.username)
      setSelected(new Set(result.repos.filter(r => !r.is_fork).map(r => r.url)))
      setStep('select')
    } catch (err) {
      setError(err.message)
      setStep('input')
    }
  }

  const toggleRepo = url => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(url) ? next.delete(url) : next.add(url)
      return next
    })
  }

  const handleImport = async () => {
    if (selectedRepos.length === 0) return
    const initialCards = selectedRepos.map(r => ({
      repo_url: r.url, repo_name: r.name,
      loading: true, data: null, error: null, skipped: false,
      name: r.name, purpose: '', your_role: 'solo_builder', scale: 'personal',
      tech_stack: [], key_features: [], readme_text: '',
    }))
    setCards(initialCards)
    setStep('fetching-data')

    const promises = selectedRepos.map(async repo => {
      try {
        const result = await importGitHubRepo(repo.url)
        setCards(prev => prev.map(c =>
          c.repo_url === repo.url
            ? {
                ...c,
                loading: false,
                name: result.name || repo.name,
                tech_stack: result.tech_stack || [],
                readme_text: result.readme_text || '',
                purpose: result.description || '',
              }
            : c
        ))
      } catch (err) {
        setCards(prev => prev.map(c =>
          c.repo_url === repo.url ? { ...c, error: err.message, loading: false } : c
        ))
      }
    })
    await Promise.allSettled(promises)
    setStep('review')
  }

  const updateCard = (repoUrl, key, value) =>
    setCards(prev => prev.map(c =>
      c.repo_url === repoUrl ? { ...c, [key]: value } : c
    ))

  const skipCard = repoUrl =>
    setCards(prev => prev.map(c => c.repo_url === repoUrl ? { ...c, skipped: true } : c))

  const unskipCard = repoUrl =>
    setCards(prev => prev.map(c => c.repo_url === repoUrl ? { ...c, skipped: false } : c))

  const handleSave = async () => {
    setStep('saving')
    const toSave = cards.filter(c => !c.skipped && !c.error && !c.loading)
    const saved = []
    for (const card of toSave) {
      try {
        const projectCard = {
          name: card.name,
          repo_url: card.repo_url,
          tech_stack: card.tech_stack,
          purpose: card.purpose,
          your_role: card.your_role,
          scale: card.scale,
          key_features: card.key_features,
          readme_text: card.readme_text,
        }
        const result = await confirmGitHubProject(projectCard)
        saved.push(result.project)
      } catch { /* skip individual failures */ }
    }
    setSavedCount(saved.length)
    onImported(saved)
    setStep('done')
    setTimeout(onClose, 2500)
  }

  const pendingCount = cards.filter(c => c.loading).length

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.head}>
          <h2 style={s.title}>Import from GitHub</h2>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Step: input */}
        {(step === 'input' || step === 'fetching-repos') && (
          <div>
            <p style={s.hint}>
              Enter your GitHub username or profile URL. We'll fetch your public repos so you can pick which to add as projects.
            </p>
            <div style={s.field}>
              <label style={s.label}>GitHub username or profile URL</label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFetch()}
                placeholder="johndoe  or  https://github.com/johndoe"
                style={s.input}
                disabled={isFetching}
                autoFocus
              />
            </div>
            {error && <p style={s.error}>{error}</p>}
            <div style={s.btnRow}>
              <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
              <button
                style={{ ...s.primaryBtn, opacity: isFetching || !username.trim() ? 0.5 : 1 }}
                onClick={handleFetch}
                disabled={isFetching || !username.trim()}
              >
                {isFetching
                  ? <><SpinnerSm />Fetching repos…</>
                  : 'Fetch repos →'}
              </button>
            </div>
          </div>
        )}

        {/* Step: select */}
        {step === 'select' && (
          <div>
            <div style={s.selectMeta}>
              <span style={s.metaText}>
                <strong>{resolvedUsername}</strong> · {repos.length} public repo{repos.length !== 1 ? 's' : ''}
              </span>
              <div style={s.selectActions}>
                <button style={s.linkBtn} onClick={() => setSelected(new Set(repos.map(r => r.url)))}>All</button>
                <span style={s.dot}>·</span>
                <button style={s.linkBtn} onClick={() => setSelected(new Set())}>None</button>
                <span style={s.dot}>·</span>
                <button style={s.linkBtn} onClick={() => setSelected(new Set(repos.filter(r => !r.is_fork).map(r => r.url)))}>
                  Own only
                </button>
              </div>
            </div>

            <div style={s.repoList}>
              {repos.map(repo => {
                const checked = selected.has(repo.url)
                const langColor = LANG_COLORS[repo.language] || 'var(--color-text-3)'
                return (
                  <div
                    key={repo.url}
                    style={{ ...s.repoRow, ...(checked ? s.repoRowChecked : {}) }}
                    onClick={() => toggleRepo(repo.url)}
                  >
                    <div style={s.checkboxWrap}>
                      <div style={{ ...s.checkbox, ...(checked ? s.checkboxOn : {}) }}>
                        {checked && (
                          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="2 6 5 9 10 3" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div style={s.repoInfo}>
                      <div style={s.repoNameRow}>
                        <span style={s.repoName}>{repo.name}</span>
                        {repo.is_fork && <span style={s.forkBadge}>fork</span>}
                      </div>
                      {repo.description && <p style={s.repoDesc}>{repo.description}</p>}
                    </div>
                    <div style={s.repoMetaCol}>
                      {repo.language && (
                        <span style={s.langBadge}>
                          <span style={{ ...s.langDot, background: langColor }} />
                          {repo.language}
                        </span>
                      )}
                      <span style={s.repoStat}>
                        {repo.stars > 0 && (
                          <><StarIcon />{repo.stars} · </>
                        )}
                        {relativeTime(repo.updated_at)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {selected.size > 10 && (
              <p style={s.warning}>Maximum 10 repos per import.</p>
            )}

            <div style={s.btnRow}>
              <button style={s.cancelBtn} onClick={() => setStep('input')}>← Back</button>
              <button
                style={{ ...s.primaryBtn, opacity: selected.size === 0 || selected.size > 10 ? 0.4 : 1 }}
                onClick={handleImport}
                disabled={selected.size === 0 || selected.size > 10}
              >
                Import {selected.size > 0 ? `${selected.size} ` : ''}selected →
              </button>
            </div>
          </div>
        )}

        {/* Step: fetching-data / review / saving */}
        {(step === 'fetching-data' || step === 'review' || step === 'saving') && (
          <div>
            <p style={s.hint}>
              {step === 'fetching-data' && pendingCount > 0
                ? `Fetching data for ${pendingCount} repo${pendingCount !== 1 ? 's' : ''}…`
                : 'Review the details below. Tech stack was extracted from the repo. Fill in the rest before saving.'}
            </p>
            <div style={s.cardList}>
              {cards.map(card => (
                <CardItem
                  key={card.repo_url}
                  card={card}
                  disabled={isSaving}
                  onUpdate={(key, val) => updateCard(card.repo_url, key, val)}
                  onSkip={() => skipCard(card.repo_url)}
                  onUnskip={() => unskipCard(card.repo_url)}
                />
              ))}
            </div>
            <div style={s.btnRow}>
              <button style={s.cancelBtn} onClick={() => setStep('select')} disabled={isSaving}>
                ← Back
              </button>
              <button
                style={{ ...s.primaryBtn, opacity: step === 'fetching-data' || isSaving || validCards.length === 0 ? 0.4 : 1 }}
                onClick={handleSave}
                disabled={step === 'fetching-data' || isSaving || validCards.length === 0}
              >
                {isSaving
                  ? <><SpinnerSm />Saving…</>
                  : `Save ${validCards.length} project${validCards.length !== 1 ? 's' : ''} →`}
              </button>
            </div>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && (
          <div style={s.done}>
            <div style={s.doneIcon}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p style={s.doneTitle}>{savedCount} project{savedCount !== 1 ? 's' : ''} saved</p>
            <p style={s.doneHint}>Your profile has been updated.</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Card item ─────────────────────────────────────────────────────────────── */
function CardItem({ card, disabled, onUpdate, onSkip, onUnskip }) {
  const [open, setOpen] = useState(true)
  const [showReadme, setShowReadme] = useState(false)

  if (card.loading) {
    return (
      <div style={ci.card}>
        <div style={ci.head}>
          <span style={ci.repoName}>{card.repo_name}</span>
          <span style={ci.analyzing}><SpinnerSm color="var(--color-text-3)" />Fetching…</span>
        </div>
      </div>
    )
  }

  if (card.skipped) {
    return (
      <div style={{ ...ci.card, opacity: 0.45 }}>
        <div style={ci.head}>
          <span style={ci.repoName}>{card.repo_name}</span>
          <button style={ci.unskipBtn} onClick={onUnskip}>Undo</button>
        </div>
      </div>
    )
  }

  if (card.error) {
    return (
      <div style={{ ...ci.card, ...ci.cardErr }}>
        <div style={ci.head}>
          <span style={ci.repoName}>{card.repo_name}</span>
          <button style={ci.skipBtn} onClick={onSkip}>Skip</button>
        </div>
        <p style={ci.errMsg}>{card.error}</p>
      </div>
    )
  }

  return (
    <div style={ci.card}>
      <div style={{ ...ci.head, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={ci.headLeft}>
          <span style={ci.chevron}>{open ? '▾' : '▸'}</span>
          <span style={ci.repoName}>{card.repo_name}</span>
          <span style={ci.successDot} title="Fetched" />
        </div>
        <button
          style={ci.skipBtn}
          onClick={e => { e.stopPropagation(); onSkip() }}
          disabled={disabled}
        >
          Skip
        </button>
      </div>

      {open && (
        <div style={ci.fields}>
          <div style={ci.field}>
            <label style={ci.label}>Project name</label>
            <input value={card.name || ''} onChange={e => onUpdate('name', e.target.value)} style={ci.input} disabled={disabled} />
          </div>
          <div style={ci.field}>
            <label style={ci.label}>Purpose / Description</label>
            <textarea value={card.purpose || ''} onChange={e => onUpdate('purpose', e.target.value)} style={{ ...ci.input, resize: 'vertical' }} rows={2} disabled={disabled} />
          </div>
          <div style={ci.field}>
            <label style={ci.label}>Tech stack (comma-separated)</label>
            <input
              value={(card.tech_stack || []).join(', ')}
              onChange={e => onUpdate('tech_stack', e.target.value.split(',').map(x => x.trim()).filter(Boolean))}
              style={ci.input}
              disabled={disabled}
            />
          </div>
          <div style={ci.row2}>
            <div style={ci.field}>
              <label style={ci.label}>Role</label>
              <select value={card.your_role || 'solo_builder'} onChange={e => onUpdate('your_role', e.target.value)} style={ci.select} disabled={disabled}>
                <option value="solo_builder">Solo Builder</option>
                <option value="contributor">Contributor</option>
                <option value="maintainer">Maintainer</option>
                <option value="team_lead">Team Lead</option>
              </select>
            </div>
            <div style={ci.field}>
              <label style={ci.label}>Scale</label>
              <select value={card.scale || 'personal'} onChange={e => onUpdate('scale', e.target.value)} style={ci.select} disabled={disabled}>
                <option value="personal">Personal</option>
                <option value="team">Team</option>
                <option value="production">Production</option>
              </select>
            </div>
          </div>
          <div style={ci.field}>
            <label style={ci.label}>Key features (one per line)</label>
            <textarea
              value={(card.key_features || []).join('\n')}
              onChange={e => onUpdate('key_features', e.target.value.split('\n').filter(Boolean))}
              style={{ ...ci.input, resize: 'vertical' }}
              rows={3}
              disabled={disabled}
            />
          </div>

          {card.readme_text && (
            <div style={ci.readmeSection}>
              <button
                style={ci.readmeToggle}
                onClick={() => setShowReadme(o => !o)}
              >
                {showReadme ? '▾ Hide' : '▸ Show'} README (reference)
              </button>
              {showReadme && (
                <pre style={ci.readmeBox}>{card.readme_text}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Tiny helpers ───────────────────────────────────────────────────────────── */
function SpinnerSm({ color = 'currentColor' }) {
  return (
    <span style={{
      display: 'inline-block', width: '12px', height: '12px', flexShrink: 0,
      border: `2px solid ${color}`, borderTopColor: 'transparent',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
      marginRight: '6px',
    }} />
  )
}

function StarIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ marginRight: '2px', verticalAlign: 'middle' }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

/* ── Modal styles ───────────────────────────────────────────────────────────── */
const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'oklch(16% 0.018 75 / 0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 'var(--space-6)',
  },
  modal: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-xl)',
    padding: 'var(--space-8)',
    width: '100%', maxWidth: '640px',
    maxHeight: '90vh', overflowY: 'auto',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-md)',
  },
  head: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 'var(--space-6)',
  },
  title: {
    fontFamily: 'var(--font-heading)', fontSize: '18px', fontWeight: 700,
    color: 'var(--color-text)', letterSpacing: '-0.01em',
  },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--color-text-3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '32px', height: '32px', borderRadius: 'var(--radius-sm)',
  },
  hint: { fontSize: '13.5px', color: 'var(--color-text-3)', marginBottom: 'var(--space-5)', lineHeight: '1.6' },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginBottom: 'var(--space-4)' },
  label: {
    fontSize: '11.5px', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: 'var(--color-text-3)',
  },
  input: {
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    padding: '9px var(--space-3)', fontSize: '14px',
    color: 'var(--color-text)', fontFamily: 'var(--font-ui)',
    background: 'var(--color-bg)', outline: 'none', width: '100%',
    boxSizing: 'border-box',
  },
  error: { color: 'var(--color-error)', fontSize: '12.5px', marginBottom: 'var(--space-3)' },
  warning: { color: 'var(--color-warning)', fontSize: '12.5px', marginBottom: 'var(--space-3)' },
  btnRow: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-5)' },
  cancelBtn: {
    background: 'none', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', padding: '8px var(--space-5)',
    fontSize: '13.5px', color: 'var(--color-text-2)', cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
  },
  primaryBtn: {
    background: 'var(--color-accent)', border: 'none',
    borderRadius: 'var(--radius-md)', padding: '8px var(--space-5)',
    fontSize: '13.5px', fontWeight: 600, color: 'var(--color-surface)',
    cursor: 'pointer', fontFamily: 'var(--font-ui)',
    display: 'flex', alignItems: 'center', gap: '4px',
  },
  selectMeta: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },
  metaText: { fontSize: '13px', color: 'var(--color-text-2)' },
  selectActions: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  linkBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '12px', color: 'var(--color-accent)', fontFamily: 'var(--font-ui)',
    padding: '2px 0', fontWeight: 500,
  },
  dot: { color: 'var(--color-text-3)', fontSize: '12px' },
  repoList: {
    maxHeight: '340px', overflowY: 'auto',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-4)',
  },
  repoRow: {
    display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--color-border-subtle)',
    cursor: 'pointer', userSelect: 'none',
    transition: 'background 0.1s',
  },
  repoRowChecked: { background: 'var(--color-accent-subtle)' },
  checkboxWrap: { paddingTop: '2px', flexShrink: 0 },
  checkbox: {
    width: '16px', height: '16px', borderRadius: '4px',
    border: '1.5px solid var(--color-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--color-surface)',
    transition: 'background 0.1s, border-color 0.1s',
  },
  checkboxOn: {
    background: 'var(--color-accent)',
    borderColor: 'var(--color-accent)',
  },
  repoInfo: { flex: 1, minWidth: 0 },
  repoNameRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: '2px' },
  repoName: { fontSize: '13.5px', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  forkBadge: {
    fontSize: '10px', fontWeight: 600, color: 'var(--color-text-3)',
    background: 'var(--color-surface-raised)', border: '1px solid var(--color-border)',
    borderRadius: '3px', padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.04em',
  },
  repoDesc: { fontSize: '12px', color: 'var(--color-text-3)', lineHeight: '1.4', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' },
  repoMetaCol: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
    gap: '4px', flexShrink: 0,
  },
  langBadge: {
    display: 'flex', alignItems: 'center', gap: '4px',
    fontSize: '11.5px', color: 'var(--color-text-3)',
  },
  langDot: { width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0 },
  repoStat: { fontSize: '11px', color: 'var(--color-text-3)', display: 'flex', alignItems: 'center' },
  cardList: {
    display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
    maxHeight: '420px', overflowY: 'auto', marginBottom: 'var(--space-4)',
    paddingRight: '2px',
  },
  done: { textAlign: 'center', padding: 'var(--space-12) 0' },
  doneIcon: {
    width: '52px', height: '52px', borderRadius: '50%',
    background: 'oklch(96% 0.05 145)', color: 'var(--color-success)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto var(--space-4)',
  },
  doneTitle: { fontSize: '16px', fontWeight: 700, color: 'var(--color-text)', marginBottom: 'var(--space-1)' },
  doneHint: { fontSize: '13px', color: 'var(--color-text-3)' },
}

/* ── Card item styles ───────────────────────────────────────────────────────── */
const ci = {
  card: {
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
    overflow: 'hidden', background: 'var(--color-surface)',
  },
  cardErr: { borderColor: 'oklch(88% 0.08 22)', background: 'oklch(99% 0.01 22)' },
  head: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--color-surface-raised)',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  headLeft: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' },
  chevron: { fontSize: '10px', color: 'var(--color-text-3)', userSelect: 'none' },
  repoName: { fontSize: '13.5px', fontWeight: 600, color: 'var(--color-text)' },
  successDot: {
    width: '7px', height: '7px', borderRadius: '50%',
    background: 'var(--color-success)', flexShrink: 0,
  },
  analyzing: { display: 'flex', alignItems: 'center', fontSize: '12px', color: 'var(--color-text-3)' },
  skipBtn: {
    background: 'none', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', padding: '3px 10px',
    fontSize: '12px', color: 'var(--color-text-3)', cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
  },
  unskipBtn: {
    background: 'none', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', padding: '3px 10px',
    fontSize: '12px', color: 'var(--color-accent)', cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
  },
  errMsg: { fontSize: '12.5px', color: 'var(--color-error)', padding: 'var(--space-3) var(--space-4)' },
  fields: { padding: 'var(--space-4)' },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginBottom: 'var(--space-3)' },
  label: {
    fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.07em', color: 'var(--color-text-3)',
  },
  input: {
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    padding: '8px var(--space-3)', fontSize: '13.5px',
    color: 'var(--color-text)', fontFamily: 'var(--font-ui)',
    background: 'var(--color-bg)', outline: 'none', width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    padding: '8px var(--space-3)', fontSize: '13.5px',
    background: 'var(--color-bg)', color: 'var(--color-text)',
    fontFamily: 'var(--font-ui)', width: '100%',
  },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' },
  readmeSection: { marginTop: 'var(--space-3)' },
  readmeToggle: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '12px', color: 'var(--color-text-3)', fontFamily: 'var(--font-ui)',
    padding: '4px 0', fontWeight: 500,
  },
  readmeBox: {
    marginTop: 'var(--space-2)',
    padding: 'var(--space-3)',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '12px',
    lineHeight: '1.5',
    color: 'var(--color-text-2)',
    maxHeight: '200px',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'var(--font-ui)',
  },
}
