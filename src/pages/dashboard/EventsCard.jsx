import { useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../api/client.js'
import { Button } from '../../components/ui/Button.jsx'
import { Card } from '../../components/ui/Card.jsx'
import { Field } from '../../components/ui/Field.jsx'
import { Input } from '../../components/ui/Input.jsx'
import { Select } from '../../components/ui/Select.jsx'

// The events calendar (migration 036, the client 2026-10-24), under the
// production list: Holy Week, Pahiyas, Christmas, New Year, long weekends.
// Each makes production go up by its multiplier — x4 by default, for hard
// breads, starting a week ahead. Everyone sees it; the admin keeps it.
const emptyForm = { name: '', startsOn: '', endsOn: '', multiplier: '4', appliesTo: 'HARD', leadDays: '7' }
const appliesLabel = { HARD: 'Hard breads', SOFT: 'Soft breads', BOTH: 'Soft and hard breads' }
const dayFormat = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
const showDay = (iso) => dayFormat.format(new Date(`${iso}T12:00:00+08:00`))

export function EventsCard({ user, onChanged }) {
  const isAdmin = user?.role === 'ADMIN'
  const [events, setEvents] = useState(null)
  const [editing, setEditing] = useState(null) // null, 'new', or an event
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => apiGet('/api/events').then((data) => setEvents(data.events)).catch((error) => setMessage(error.message))
  useEffect(() => { load() }, [])

  const open = (event) => {
    setEditing(event ?? 'new')
    setForm(event
      ? { name: event.name, startsOn: event.startsOn, endsOn: event.endsOn, multiplier: String(event.multiplier), appliesTo: event.appliesTo, leadDays: String(event.leadDays) }
      : emptyForm)
    setErrors({})
    setMessage('')
  }
  const setField = (field, value) => setForm({ ...form, [field]: value })

  const save = async (submitEvent) => {
    submitEvent.preventDefault()
    setSaving(true)
    setErrors({})
    const body = { ...form, endsOn: form.endsOn || form.startsOn, multiplier: Number(form.multiplier), leadDays: Number(form.leadDays) }
    try {
      if (editing === 'new') await apiPost('/api/events', body)
      else await apiPatch(`/api/events/${editing.id}`, body)
      setEditing(null)
      await load()
      onChanged?.()
    } catch (error) {
      setErrors(error.errors ?? {})
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (event) => {
    if (!window.confirm(`Remove "${event.name}" (${showDay(event.startsOn)}) from the events calendar?`)) return
    try {
      await apiDelete(`/api/events/${event.id}`)
      setEditing(null)
      await load()
      onChanged?.()
    } catch (error) {
      setMessage(error.message)
    }
  }

  return (
    <Card className="mt-4 p-6 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Events</h2>
          <p className="mt-1 text-sm text-ink-500">Holy Week, Pahiyas, Christmas, New Year and long weekends. Production goes up by each event&apos;s multiplier, starting its lead days ahead. Weekends are automatic: hard breads x2 from Thursday.</p>
        </div>
        {isAdmin && !editing && <Button type="button" size="sm" onClick={() => open(null)}>Add event</Button>}
      </div>

      {message && <p className="mt-3 text-sm text-red-700">{message}</p>}

      {editing && (
        <form onSubmit={save} noValidate className="mt-4 space-y-3 rounded-panel bg-surface-sunk p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Event" error={errors.name}>
              <Input value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="e.g. Long weekend (Nov 1–2)" />
            </Field>
            <Field label="From" error={errors.startsOn}>
              <Input type="date" value={form.startsOn} onChange={(event) => setField('startsOn', event.target.value)} />
            </Field>
            <Field label="To" error={errors.endsOn}>
              <Input type="date" value={form.endsOn} min={form.startsOn || undefined} onChange={(event) => setField('endsOn', event.target.value)} />
            </Field>
            <Field label="Make how many times the usual" error={errors.multiplier}>
              <Input value={form.multiplier} onChange={(event) => setField('multiplier', event.target.value.replace(/[^\d.]/g, '').slice(0, 4))} inputMode="decimal" />
            </Field>
            <Field label="For" error={errors.appliesTo}>
              <Select value={form.appliesTo} onChange={(event) => setField('appliesTo', event.target.value)}>
                <option value="HARD">Hard breads (pasalubong)</option>
                <option value="SOFT">Soft breads</option>
                <option value="BOTH">Soft and hard breads</option>
              </Select>
            </Field>
            <Field label="Start preparing (days before)" error={errors.leadDays}>
              <Input value={form.leadDays} onChange={(event) => setField('leadDays', event.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : editing === 'new' ? 'Add event' : 'Save'}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            {editing !== 'new' && <button type="button" onClick={() => remove(editing)} className="ml-auto text-sm font-medium text-ink-500 hover:text-red-700 hover:underline">Remove event</button>}
          </div>
        </form>
      )}

      {events === null ? (
        <p className="mt-4 text-sm text-ink-500">Loading…</p>
      ) : events.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">No events coming up.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line-100">
          {events.map((event) => (
            <li key={event.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-ink-900">{event.name}</span>
                <span className="block text-xs text-ink-500">
                  {showDay(event.startsOn)}{event.endsOn !== event.startsOn ? ` – ${showDay(event.endsOn)}` : ''} · {appliesLabel[event.appliesTo]} · prepare {event.leadDays} day{event.leadDays === 1 ? '' : 's'} ahead
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">x{event.multiplier}</span>
                {isAdmin && <Button type="button" size="sm" variant="ghost" onClick={() => open(event)}>Edit</Button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
