// Shared fetch wrapper for talking to the PECTRACK API. Centralizes what
// every page used to repeat individually: attach the session cookie,
// JSON-encode the body, and turn a failed request into one Error shape
// every caller can handle the same way (error.message for display,
// error.errors for field-level validation messages).
// Shared by request() and apiUpload() below — both send different kinds
// of body (JSON vs raw bytes), but turn the response into the same error
// shape once it comes back.
// PHASE10 B6. requireAuth marks a 401 that means "your session ended" —
// timed out after inactivity, or gone (signed out elsewhere, account
// deactivated) — with a code, so it is never confused with a wrong
// password. The app listens for this event, clears the signed-in account
// and opens the sign-in pop-up, instead of every panel on the screen
// saying "Sign in to continue." on its own.
export const sessionEndedEvent = 'pectrack:session-ended'
const sessionEndedCodes = new Set(['SESSION_IDLE', 'SIGNED_OUT'])

async function handleResponse(response) {
  // Some responses (e.g. logout's 204) have no body at all.
  const data = await response.json().catch(() => null)
  if (response.status === 401 && sessionEndedCodes.has(data?.code)) {
    window.dispatchEvent(new CustomEvent(sessionEndedEvent, { detail: { code: data.code, message: data.message } }))
  }
  if (!response.ok) {
    const error = new Error(data?.message ?? 'Something went wrong. Please try again later.')
    error.errors = data?.errors
    error.status = response.status
    // /api/auth/login's wrong-door refusal names the door that WOULD have
    // worked; LoginForm turns it into a one-click switch.
    error.audience = data?.audience
    throw error
  }
  return data
}

// background: a request the page makes on its own (a self-refreshing
// screen), which must not count as the person being active — see
// server/lib/auth.js.
async function request(path, { method = 'GET', body, background = false } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (background) headers['X-Pectrack-Background'] = '1'
  let response
  try {
    response = await fetch(path, {
      method,
      credentials: 'include',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    // The request never reached the server at all (offline, server down).
    throw new Error('Unable to reach the service. Please try again later.')
  }
  return handleResponse(response)
}

export const apiGet = (path, { background = false } = {}) => request(path, { background })
export const apiPost = (path, body) => request(path, { method: 'POST', body })
export const apiPatch = (path, body) => request(path, { method: 'PATCH', body })
// routes/recipes.js's PUT — a whole-recipe replace, not a partial edit.
export const apiPut = (path, body) => request(path, { method: 'PUT', body })
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
