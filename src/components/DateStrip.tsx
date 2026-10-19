import { useEffect, useMemo, useRef } from 'react'
import { dayLabel, shiftDay, usToday } from '../lib/format'

/** Bandeau de dates défilant (uniquement les jours avec des matchs quand le calendrier est connu). */
export function DateStrip({
  calendar,
  selected,
  onSelect,
}: {
  calendar: string[]
  selected: string
  onSelect: (day: string) => void
}) {
  const today = usToday()
  const days = useMemo(() => {
    const set = new Set(calendar.length ? calendar : [])
    if (!set.size) for (let i = -7; i <= 7; i++) set.add(shiftDay(selected, i))
    set.add(selected)
    return [...set].sort()
  }, [calendar, selected])

  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const strip = ref.current
    const el = strip?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (strip && el) {
      strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' })
    }
  }, [selected, days])

  const idx = days.indexOf(selected)
  const step = (d: number) => {
    const next = days[idx + d]
    if (next) onSelect(next)
  }

  return (
    <div className="date-bar">
      <button className="icon-btn" onClick={() => step(-1)} disabled={idx <= 0} aria-label="Jour précédent">
        ‹
      </button>
      <div className="date-strip" ref={ref}>
        {days.map((d) => {
          const l = dayLabel(d)
          return (
            <button
              key={d}
              className={`date-chip ${d === today ? 'today' : ''}`}
              aria-pressed={d === selected}
              onClick={() => onSelect(d)}
            >
              <span className="date-wd">{d === today ? "Auj." : l.weekday}</span>
              <span className="date-d">{l.date}</span>
            </button>
          )
        })}
      </div>
      <button className="icon-btn" onClick={() => step(1)} disabled={idx >= days.length - 1} aria-label="Jour suivant">
        ›
      </button>
      <label className="icon-btn date-pick" aria-label="Choisir une date">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input type="date" value={selected} onChange={(e) => e.target.value && onSelect(e.target.value)} />
      </label>
    </div>
  )
}
