import { useEffect, useState } from 'react'
import Nav from '../components/Nav.jsx'
import GitHubProfileImport from '../components/GitHubProfileImport.jsx'
import CVUpload from '../components/CVUpload.jsx'
import {
  ContactSection,
  SummarySection,
  SkillsSection,
  ExperienceSection,
  EducationSection,
  ProjectsSection,
  VolunteeringSection,
} from '../components/ProfileForm.jsx'
import { createProfile } from '../services/api.js'
import { useProfile } from '../hooks/useProfile.js'

const EMPTY_CONTACT = { name: '', email: '', phone: '', linkedin: '', github: '', location: '' }

export default function Profile() {
  const { profile, loading, error: profileError, reload } = useProfile()
  const [showGitHub, setShowGitHub] = useState(false)
  const [showCVUpload, setShowCVUpload] = useState(false)

  const [contact, setContact] = useState(EMPTY_CONTACT)
  const [summary, setSummary] = useState('')
  const [skills, setSkills] = useState([])
  const [experiences, setExperiences] = useState([])
  const [education, setEducation] = useState([])
  const [projects, setProjects] = useState([])
  const [volunteering, setVolunteering] = useState([])
  const [initError, setInitError] = useState(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (profile) {
      setContact(profile.contact || EMPTY_CONTACT)
      setSummary(profile.summary || '')
      setSkills(profile.skills || [])
      setExperiences(profile.experiences || [])
      setEducation(profile.education || [])
      setProjects(profile.projects || [])
      setVolunteering(profile.volunteering || [])
    }
  }, [profile])

  useEffect(() => {
    if (!loading && !profile && !profileError) {
      setCreating(true)
      createProfile({})
        .then(() => reload())
        .catch((err) => setInitError(err.message))
        .finally(() => setCreating(false))
    }
  }, [loading, profile, profileError])

  const handleGitHubImported = (projects) => {
    setProjects((prev) => [...prev, ...projects])
    setShowGitHub(false)
    reload()
  }

  const handleCVApply = async (extracted) => {
    if (extracted.contact) setContact(prev => {
      const merged = { ...prev }
      for (const [k, v] of Object.entries(extracted.contact)) {
        if (v) merged[k] = v
      }
      return merged
    })
    if (extracted.summary) setSummary(extracted.summary)
    if (extracted.skills?.length) setSkills(prev => {
      const existing = new Set(prev)
      const merged = [...prev]
      for (const s of extracted.skills) {
        if (!existing.has(s)) merged.push(s)
      }
      return merged
    })
    if (extracted.experiences?.length) setExperiences(prev => [
      ...prev,
      ...extracted.experiences.map(e => ({ ...e, id: crypto.randomUUID() })),
    ])
    if (extracted.education?.length) setEducation(prev => [
      ...prev,
      ...extracted.education.map(e => ({ ...e, id: crypto.randomUUID() })),
    ])
  }

  return (
    <div className="app-shell">
      <Nav />
      <main className="page-main">
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>

          <header style={p.header}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h1 style={p.h1}>Profile</h1>
              <button style={p.uploadBtn} onClick={() => setShowCVUpload(true)}>
                Upload CV (PDF)
              </button>
            </div>
            <p style={p.sub}>Keep this accurate. The AI tailors only what you provide here.</p>
          </header>

          {(loading || creating) ? (
            <div style={p.loadingWrap}>
              <div style={p.spinner} />
            </div>
          ) : (
            <>
              <ContactSection data={contact} onChange={setContact} />
              <SummarySection data={summary} onChange={setSummary} />
              <SkillsSection data={skills} onChange={setSkills} />
              <ExperienceSection data={experiences} onChange={setExperiences} />
              <EducationSection data={education} onChange={setEducation} />
              <VolunteeringSection data={volunteering} onChange={setVolunteering} />
              <ProjectsSection
                data={projects}
                onChange={setProjects}
                onOpenGitHubImport={() => setShowGitHub(true)}
              />
            </>
          )}

          {showGitHub && (
            <GitHubProfileImport
              onClose={() => setShowGitHub(false)}
              onImported={handleGitHubImported}
            />
          )}

          {showCVUpload && (
            <CVUpload
              onClose={() => setShowCVUpload(false)}
              onApply={handleCVApply}
            />
          )}
        </div>
      </main>
    </div>
  )
}

const p = {
  header: { marginBottom: 'var(--space-8)' },
  h1: {
    fontFamily: 'var(--font-heading)',
    fontSize: '26px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '-0.02em',
    marginBottom: 'var(--space-1)',
  },
  sub: { fontSize: '14px', color: 'var(--color-text-3)', marginTop: 'var(--space-1)' },
  uploadBtn: {
    background: 'none',
    border: '1px dashed var(--color-accent)',
    borderRadius: 'var(--radius-md)',
    padding: '7px var(--space-4)',
    fontSize: '13px',
    color: 'var(--color-accent)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
  },
  loadingWrap: { display: 'flex', justifyContent: 'center', padding: 'var(--space-12) 0' },
  spinner: {
    width: '32px',
    height: '32px',
    border: '2.5px solid var(--color-border)',
    borderTopColor: 'var(--color-accent)',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  error: {
    background: 'var(--color-error-bg)',
    border: '1px solid oklch(88% 0.08 22)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3) var(--space-4)',
    color: 'var(--color-error)',
    fontSize: '13px',
    marginBottom: 'var(--space-5)',
  },
}
