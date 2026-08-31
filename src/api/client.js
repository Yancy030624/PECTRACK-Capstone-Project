// Shared fetch wrapper for talking to the PECTRACK API. Centralizes what
// every page used to repeat individually: attach the session cookie,
// JSON-encode the body, and turn a failed request into one Error shape
// every caller can handle the same way (error.message for display,
// error.errors for field-level validation messages).
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

export const apiGet = (path) => request(path)
export const apiPost = (path, body) => request(path, { method: 'POST', body })
export const apiPatch = (path, body) => request(path, { method: 'PATCH', body })
export const apiDelete = (path) => request(path, { method: 'DELETE' })
