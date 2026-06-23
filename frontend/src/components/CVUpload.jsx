import { useState, useRef } from 'react'
import { uploadCV } from '../services/api.js'

export default function CVUpload({ onClose, onApply }) {
  const [step, setStep] = useState('pick')   // pick | uploading | review
  const [file, setFile] = useState(null)
  const [extracted, setExtracted] = useState(null)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleFile = (f) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported.')
      return
    }
    setFile(f)
    setError(null)
  }

  const handleUpload = async () => {
    if (!file) return
    setError(null)
    setStep('uploading')
    try {
      const result = await uploadCV(file)
      setExtracted(result.extracted)
      setStep('review')
    } catch (err) {
      setError(err.message)
      setStep('pick')
    }
  }

  const updateField = (section, value) => {
    setExtracted(prev => ({ ...prev, [section]: value }))
  }

  const updateContact = (key, value) => {
    setExtracted(prev => ({
      ...prev,
      contact: { ...prev.contact, [key]: value },
    }))
  }

  const updateExperience = (idx, patch) => {
    setExtracted(prev => ({
      ...prev,
      experiences: prev.experiences.map((e, i) => i === idx ? { ...e, ...patch } : e),
    }))
  }

  const removeExperience = (idx) => {
    setExtracted(prev => ({
      ...prev,
      experiences: prev.experiences.filter((_, i) => i !== idx),
    }))
  }

  const updateEducation = (idx, patch) => {
    setExtracted(prev => ({
      ...prev,
      education: prev.education.map((e, i) => i === idx ? { ...e, ...patch } : e),
    }))
  }

  const removeEducation = (idx) => {
    setExtracted(prev => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== idx),
    }))
  }

  const handleApply = () => {
    onApply(extracted)
    onClose()
  }

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.head}>
          <h2 style={s.title}>Upload CV (PDF)</h2>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Step: pick file */}
        {(step === 'pick' || step === 'uploading') && (
          <div>
            <div
              style={{ ...s.dropZone, ...(dragOver ? s.dropZoneOver : {}) }}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])}
              />
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <polyline points="9 15 12 12 15 15" />
              </svg>
              <p style={s.dropText}>
                {file ? file.name : 'Drop your PDF here or click to browse'}
              </p>
              {file && <p style={s.dropHint}>{(file.size / 1024).toFixed(0)} KB</p>}
            </div>

            {error && <p style={s.error}>{error}</p>}

            <div style={s.btnRow}>
              <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
              <button
                style={{ ...s.primaryBtn, opacity: !file || step === 'uploading' ? 0.5 : 1 }}
                onClick={handleUpload}
                disabled={!file || step === 'uploading'}
              >
                {step === 'uploading'
                  ? <><Spinner />Extracting…</>
                  : 'Extract data →'}
              </button>
            </div>
          </div>
        )}

        {/* Step: review extracted data */}
        {step === 'review' && extracted && (
          <div>
            <p style={s.hint}>
              Review the extracted data below. Edit anything that looks incorrect before applying to your profile.
            </p>

            {/* Contact */}
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Contact</h3>
              <div style={s.grid2}>
                {['name', 'email', 'phone', 'location', 'linkedin', 'github'].map(key => (
                  <div key={key} style={s.field}>
                    <label style={s.label}>{key.charAt(0).toUpperCase() + key.slice(1)}</label>
                    <input
                      value={extracted.contact?.[key] || ''}
                      onChange={e => updateContact(key, e.target.value)}
                      style={s.input}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Summary</h3>
              <textarea
                value={extracted.summary || ''}
                onChange={e => updateField('summary', e.target.value)}
                style={{ ...s.input, resize: 'vertical' }}
                rows={3}
              />
            </div>

            {/* Skills */}
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Skills</h3>
              <input
                value={(extracted.skills || []).join(', ')}
                onChange={e => updateField('skills', e.target.value.split(',').map(x => x.trim()).filter(Boolean))}
                style={s.input}
                placeholder="Comma-separated skills"
              />
            </div>

            {/* Experiences */}
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Work Experience ({(extracted.experiences || []).length})</h3>
              {(extracted.experiences || []).map((exp, idx) => (
                <div key={idx} style={s.card}>
                  <div style={s.cardHead}>
                    <span style={s.cardTitle}>{exp.title || 'Role'}{exp.company ? ` — ${exp.company}` : ''}</span>
                    <button style={s.removeBtn} onClick={() => removeExperience(idx)}>Remove</button>
                  </div>
                  <div style={s.grid2}>
                    <div style={s.field}>
                      <label style={s.label}>Title</label>
                      <input value={exp.title || ''} onChange={e => updateExperience(idx, { title: e.target.value })} style={s.input} />
                    </div>
                    <div style={s.field}>
                      <label style={s.label}>Company</label>
                      <input value={exp.company || ''} onChange={e => updateExperience(idx, { company: e.target.value })} style={s.input} />
                    </div>
                    <div style={s.field}>
                      <label style={s.label}>Start date</label>
                      <input value={exp.start_date || ''} onChange={e => updateExperience(idx, { start_date: e.target.value })} style={s.input} />
                    </div>
                    <div style={s.field}>
                      <label style={s.label}>End date</label>
                      <input value={exp.end_date || ''} onChange={e => updateExperience(idx, { end_date: e.target.value })} style={s.input} />
                    </div>
                  </div>
                  <div style={s.field}>
                    <label style={s.label}>Bullets (one per line)</label>
                    <textarea
                      value={(exp.bullets || []).join('\n')}
                      onChange={e => updateExperience(idx, { bullets: e.target.value.split('\n').filter(Boolean) })}
                      style={{ ...s.input, resize: 'vertical' }}
                      rows={3}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Education */}
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Education ({(extracted.education || []).length})</h3>
              {(extracted.education || []).map((edu, idx) => (
                <div key={idx} style={s.card}>
                  <div style={s.cardHead}>
                    <span style={s.cardTitle}>{edu.degree || 'Degree'}{edu.school ? ` — ${edu.school}` : ''}</span>
                    <button style={s.removeBtn} onClick={() => removeEducation(idx)}>Remove</button>
                  </div>
                  <div style={s.grid2}>
                    <div style={s.field}>
                      <label style={s.label}>School</label>
                      <input value={edu.school || ''} onChange={e => updateEducation(idx, { school: e.target.value })} style={s.input} />
                    </div>
                    <div style={s.field}>
                      <label style={s.label}>Degree</label>
                      <input value={edu.degree || ''} onChange={e => updateEducation(idx, { degree: e.target.value })} style={s.input} />
                    </div>
                    <div style={s.field}>
                      <label style={s.label}>Field</label>
                      <input value={edu.field || ''} onChange={e => updateEducation(idx, { field: e.target.value })} style={s.input} />
                    </div>
                    <div style={s.field}>
                      <label style={s.label}>Year</label>
                      <input value={edu.year || ''} onChange={e => updateEducation(idx, { year: e.target.value })} style={s.input} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={s.btnRow}>
              <button style={s.cancelBtn} onClick={() => { setStep('pick'); setExtracted(null) }}>
                ← Re-upload
              </button>
              <button style={s.primaryBtn} onClick={handleApply}>
                Apply to profile →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: '12px', height: '12px', flexShrink: 0,
      border: '2px solid currentColor', borderTopColor: 'transparent',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
      marginRight: '6px',
    }} />
  )
}

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
    width: '100%', maxWidth: '680px',
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
  dropZone: {
    border: '2px dashed var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-10) var(--space-6)',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    marginBottom: 'var(--space-4)',
  },
  dropZoneOver: {
    borderColor: 'var(--color-accent)',
    background: 'var(--color-accent-subtle)',
  },
  dropText: { fontSize: '14px', color: 'var(--color-text-2)', marginTop: 'var(--space-3)' },
  dropHint: { fontSize: '12px', color: 'var(--color-text-3)', marginTop: 'var(--space-1)' },
  error: { color: 'var(--color-error)', fontSize: '12.5px', marginBottom: 'var(--space-3)' },
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
  section: { marginBottom: 'var(--space-5)' },
  sectionTitle: {
    fontFamily: 'var(--font-heading)', fontSize: '14px', fontWeight: 700,
    color: 'var(--color-text)', marginBottom: 'var(--space-3)',
  },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' },
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
  card: {
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    padding: 'var(--space-4)', marginBottom: 'var(--space-3)',
    background: 'var(--color-surface-raised)',
  },
  cardHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },
  cardTitle: { fontWeight: 600, fontSize: '13px', color: 'var(--color-text)' },
  removeBtn: {
    background: 'none', border: 'none', color: 'var(--color-text-3)',
    cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-ui)',
  },
}
