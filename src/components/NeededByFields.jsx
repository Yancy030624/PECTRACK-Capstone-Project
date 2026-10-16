import { closingTime, dateLimits, openForNow, timeLimits } from '../lib/orderHours.js'

// "When do you need it?" — a date and a time, used by the storefront
// checkout and the cashier's Walk-in page (the adviser, 2026-10-16).
// The date picker starts at today (tomorrow after 10:00 PM) and the time
// picker runs from 5:00 AM to 10:00 PM, from the next minute when the day
// is today. Both blank means "as soon as it's ready", which is only taken
// within those hours. lib/orderHours.js has the rules; the server checks
// them again.
//
// The two forms look different, so the field classes come from the caller.
export function NeededByFields({ date, time, onDateChange, onTimeChange, idPrefix, inputClassName, labelClassName = 'mb-1 block text-xs font-semibold', helpClassName = 'mt-1 text-xs' }) {
  const dates = dateLimits()
  const times = date ? timeLimits(date) : { min: '05:00', max: closingTime }
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
          <input
            id={`${idPrefix}-time`}
            type="time"
            value={time}
            min={times.min}
            max={times.max}
            step={60}
            onChange={(event) => onTimeChange(event.target.value)}
            className={inputClassName}
          />
        </div>
      </div>
      <p className={helpClassName}>
        {openForNow()
          ? 'Leave both blank for as soon as it’s ready. Orders are for 5:00 AM to 10:00 PM, up to 30 days ahead.'
          : 'Ordering for right now is closed (5:00 AM to 10:00 PM). Choose a date and a time.'}
      </p>
    </div>
  )
}
