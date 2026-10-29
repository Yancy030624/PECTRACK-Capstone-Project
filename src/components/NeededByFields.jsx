import { useEffect } from 'react'
import { dateLimits, openForNow, timeSlots } from '../lib/orderHours.js'

// "When do you need it?" — a date and a time, used by the storefront
// checkout and the cashier's Walk-in page (the adviser, 2026-10-16).
// The date picker starts at today (tomorrow after 10:00 PM). The time is a
// list of the times that can be chosen, every 30 minutes from 6:00 AM to
// 10:00 PM and only those still ahead today (the seniors, 2026-10-24): a
// native time input let people scroll to 3:00 AM and be refused on submit. Both blank means "as soon as it's ready", which is only taken
// within those hours. lib/orderHours.js has the rules; the server checks
// them again.
//
// The two forms look different, so the field classes come from the caller.
export function NeededByFields({ date, time, onDateChange, onTimeChange, idPrefix, inputClassName, labelClassName = 'mb-1 block text-xs font-semibold', helpClassName = 'mt-1 text-xs' }) {
  const dates = dateLimits()
  const slots = timeSlots(date)
  // A time picked before the date changed, or one that has since passed,
  // is not on the list any more; clear it rather than send it.
  const stale = Boolean(time) && !slots.some((slot) => slot.value === time)
  useEffect(() => {
    if (stale) onTimeChange('')
  }, [stale, onTimeChange])
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-date`} className={labelClassName}>Date</label>
          <input
            id={`${idPrefix}-date`}
            type="date"
            value={date}
            min={dates.min}
            max={dates.max}
            onChange={(event) => onDateChange(event.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-time`} className={labelClassName}>Time</label>
          <select
            id={`${idPrefix}-time`}
            value={stale ? '' : time}
            disabled={!date || slots.length === 0}
            onChange={(event) => onTimeChange(event.target.value)}
            className={inputClassName}
          >
            <option value="">{!date ? 'Choose a date first' : slots.length === 0 ? 'No times left on this day' : 'Choose a time'}</option>
            {slots.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
          </select>
        </div>
      </div>
      <p className={helpClassName}>
        {openForNow()
          ? 'Leave both blank for as soon as it’s ready. Pickup and delivery are from 6:00 AM to 10:00 PM, up to 30 days ahead.'
          : 'Ordering for right now is closed (pickup and delivery are from 6:00 AM to 10:00 PM). Choose a date and a time.'}
      </p>
    </div>
  )
}
