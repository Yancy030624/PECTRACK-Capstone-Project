import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../api/client.js'

// The texted-code steps for proving a phone number
// (RULES-PLANS/RESERVE_SMS_PLAN.md), shared by the sign-up form and the
// cashier's Reserve: send a code, type it, verify. The two screens draw it
// in their own style; this holds the state and the calls.
//
// `required` comes from the server: codes are off on the live site until
// SMS credits are set up, and then nothing here is shown or needed.
export function usePhoneVerification(purpose) {
  const [required, setRequired] = useState(false)
  const [token, setToken] = useState(null)
  const [verifiedPhone, setVerifiedPhone] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    apiGet('/api/phone-verification/status').then((data) => setRequired(Boolean(data.required))).catch(() => setRequired(false))
  }, [])

  const send = async (phone) => {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      const data = await apiPost('/api/phone-verification/send', { phone, purpose })
      setToken(data.verificationToken)
      setVerifiedPhone(null)
      setCode('')
      setInfo(data.message)
    } catch (failure) {
      setError(failure.errors?.contactNumber ?? failure.message)
    } finally {
      setBusy(false)
    }
  }

  const check = async () => {
    if (!token) return
    setBusy(true)
    setError('')
    try {
      const data = await apiPost('/api/phone-verification/check', { verificationToken: token, code: code.trim() })
      setVerifiedPhone(data.phone)
      setInfo('')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  // A changed number needs its own code.
  const reset = () => {
    setToken(null)
    setVerifiedPhone(null)
    setCode('')
    setError('')
    setInfo('')
  }

  return { required, token, verified: Boolean(verifiedPhone), verifiedPhone, code, setCode, busy, error, info, send, check, reset }
}
