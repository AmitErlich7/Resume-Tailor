/**
 * API service layer — authenticated via Supabase JWT.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

let _accessToken = null

export function setAccessToken(token) {
  _accessToken = token
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      console.log('[api] token set:', token.slice(0, 20) + '...', 'role:', payload.role, 'sub:', payload.sub)
    } catch { console.log('[api] token set:', token.slice(0, 20) + '...') }
  } else {
    console.log('[api] token set: null')
  }
}

function _headers(contentType = 'application/json') {
  const h = {}
  if (contentType) h['Content-Type'] = contentType
  if (_accessToken) h['Authorization'] = `Bearer ${_accessToken}`
  return h
}

async function request(method, path, body) {
  const hdrs = _headers()
  console.log('[api] request', method, path, 'hasAuth:', !!hdrs['Authorization'])
  const options = {
    method,
    headers: hdrs,
  }
  if (body !== undefined) {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(`${BASE_URL}${path}`, options)

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const json = await response.json()
      detail = json.detail || JSON.stringify(json)
      if (typeof detail === 'object') detail = JSON.stringify(detail)
    } catch {
      // ignore parse errors
    }
    const err = new Error(detail)
    err.status = response.status
    throw err
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }
  return response.blob()
}

// -------------------------------------------------------------------------
// Health
// -------------------------------------------------------------------------

export async function healthCheck() {
  const res = await fetch(`${BASE_URL}/health`)
  return res.json()
}

// -------------------------------------------------------------------------
// Profile
// -------------------------------------------------------------------------

export async function getProfile() {
  return request('GET', '/profile')
}

export async function createProfile(profileData) {
  return request('POST', '/profile', profileData)
}

export async function patchSection(section, data) {
  return request('PATCH', `/profile/${section}`, { [section]: data })
}

// -------------------------------------------------------------------------
// GitHub
// -------------------------------------------------------------------------

export async function fetchGitHubProfile(username) {
  return request('POST', '/github/fetch-profile', { username })
}

export async function importGitHubRepo(repoUrl) {
  return request('POST', '/github/import', { repo_url: repoUrl })
}

export async function confirmGitHubProject(project) {
  return request('POST', '/github/confirm', { project })
}

// -------------------------------------------------------------------------
// CV Upload
// -------------------------------------------------------------------------

export async function uploadCV(file) {
  const formData = new FormData()
  formData.append('file', file)

  const headers = {}
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`

  const response = await fetch(`${BASE_URL}/cv/upload`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const json = await response.json()
      detail = json.detail || JSON.stringify(json)
      if (typeof detail === 'object') detail = JSON.stringify(detail)
    } catch {}
    const err = new Error(detail)
    err.status = response.status
    throw err
  }

  return response.json()
}

// -------------------------------------------------------------------------
// Tailor
// -------------------------------------------------------------------------

export async function tailorResume(payload) {
  return request('POST', '/tailor', payload)
}

export async function getTailorVersions() {
  return request('GET', '/tailor/versions')
}

export async function getTailorResume(id) {
  return request('GET', `/tailor/${id}`)
}

export async function approveResume(id, flaggedClaimsReviewed = true) {
  return request('PATCH', `/tailor/${id}/approve`, {
    flagged_claims_reviewed: flaggedClaimsReviewed,
  })
}

export async function deleteResume(id) {
  return request('DELETE', `/tailor/${id}`)
}

export async function atsScoreResume(id) {
  return request('POST', `/tailor/${id}/ats-score`)
}

// -------------------------------------------------------------------------
// Export (returns Blob)
// -------------------------------------------------------------------------

export async function exportDocx(id) {
  const response = await fetch(`${BASE_URL}/export/${id}/docx`, {
    method: 'POST',
    headers: _headers(),
  })
  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const json = await response.json()
      detail = json.detail || JSON.stringify(json)
    } catch {}
    const err = new Error(detail)
    err.status = response.status
    throw err
  }
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="([^"]+)"/)
  const filename = match ? match[1] : 'resume.docx'
  return { blob, filename }
}

export async function exportPdf(id) {
  const response = await fetch(`${BASE_URL}/export/${id}/pdf`, {
    method: 'POST',
    headers: _headers(),
  })
  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const json = await response.json()
      detail = json.detail || JSON.stringify(json)
    } catch {}
    const err = new Error(detail)
    err.status = response.status
    throw err
  }
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="([^"]+)"/)
  const filename = match ? match[1] : 'resume.pdf'
  return { blob, filename }
}

// -------------------------------------------------------------------------
// File download helper
// -------------------------------------------------------------------------

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
