// Shared fetch wrapper for talking to the PECTRACK API. Centralizes what
// every page used to repeat individually: attach the session cookie,
// JSON-encode the body, and turn a failed request into one Error shape
// every caller can handle the same way (error.message for display,
// error.errors for field-level validation messages).
// Shared by request() and apiUpload() below — both send different kinds
// of body (JSON vs raw bytes), but turn the response into the same error
// shape once it comes back.
async function handleResponse(response) {
  // Some responses (e.g. logout's 204) have no body at all.
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.message ?? 'Something went wrong. Please try again later.')
    error.errors = data?.errors
    error.status = response.status
    throw error
  }
  return data
}

async function request(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    // The request never reached the server at all (offline, server down).
    throw new Error('Unable to reach the service. Please try again later.')
  }
  return handleResponse(response)
}

export const apiGet = (path) => request(path)
export const apiPost = (path, body) => request(path, { method: 'POST', body })
export const apiPatch = (path, body) => request(path, { method: 'PATCH', body })
export const apiDelete = (path) => request(path, { method: 'DELETE' })

// For routes/deliveries.js's proof-of-delivery upload (PHASE7_PLAN.md,
// Decision 8) — that route reads express.raw() bytes, not JSON, so this
// sends the file's own bytes and MIME type directly rather than
// JSON-encoding it. path may already carry query params (?proofType=…).
export async function apiUpload(path, file) {
  let response
  try {
    response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': file.type },
      body: file,
    })
  } catch {
    throw new Error('Unable to reach the service. Please try again later.')
  }
  return handleResponse(response)
}
