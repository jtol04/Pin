import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import MapPanel from './MapPanel'
import PlaceForm from './PlaceForm'
import { getTrip, updateTrip } from '../api/client'
import type {
  Place,
  DayItinerary,
  ItinerarySlot,
  MultiDayScheduleResult,
  ScheduleResult,
  TransportMode,
} from '../types'

function fmtTime(h: number): string {
  const total = Math.round(h * 60)
  const hour = Math.floor(total / 60)
  const minute = total % 60
  const period = hour < 12 ? 'AM' : 'PM'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${String(minute).padStart(2, '0')} ${period}`
}

function formatTabLabel(date: string | undefined, dayIndex: number): string {
  if (!date) return `Day ${dayIndex + 1}`
  const d = new Date(date + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽️',
  museum: '🏛️',
  park: '🌳',
  attraction: '🎡',
  shopping: '🛍️',
  lodging: '🏨',
}

// Normalize the stored itinerary into the multi-day shape regardless of
// whether the backend returned a single ScheduleResult or a full
// MultiDayScheduleResult — older trips may have either.
function toDays(itin: MultiDayScheduleResult | ScheduleResult | undefined): DayItinerary[] {
  if (!itin) return []
  if ('days' in itin && Array.isArray(itin.days)) return itin.days
  if ('itinerary' in itin) {
    return [{
      day_index: 0,
      itinerary: itin.itinerary,
      conflicts: itin.conflicts ?? [],
      stats: itin.stats ?? { stops: 0, total_hours: 0, total_travel_hours: 0, free_hours: 0, fits_in_day: true },
    }]
  }
  return []
}

interface SlotCardProps {
  slot: ItinerarySlot
  index: number
  onRemove: () => void
  removing: boolean
}

function SlotCard({ slot, index, onRemove, removing }: SlotCardProps) {
  const emoji = CATEGORY_EMOJI[slot.category ?? ''] ?? '📍'
  const durationMin = Math.round((slot.end - slot.start) * 60)

  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center pt-1">
        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
          {index}
        </div>
        <div className="w-0.5 bg-gray-200 flex-1 mt-1" />
      </div>

      <div className="flex-1 bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm mb-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-800 flex-1">
            {emoji} {slot.name}
          </h3>
          <span className="text-xs text-gray-400 whitespace-nowrap">{durationMin} min</span>
          <button
            onClick={onRemove}
            disabled={removing}
            className="text-xs text-red-500 hover:text-red-700 px-2 disabled:text-gray-300"
            title="Remove from trip"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {fmtTime(slot.start)} – {fmtTime(slot.end)}
        </p>
        {slot.travel_minutes > 0 && (
          <p className="text-xs text-indigo-400 mt-1">
            🚶 {slot.travel_minutes} min travel from previous stop
          </p>
        )}
      </div>
    </div>
  )
}

export default function SharedTripView() {
  const { tripId } = useParams<{ tripId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [days, setDays] = useState<DayItinerary[]>([])
  const [activeDayIndex, setActiveDayIndex] = useState(0)
  const [dayStart, setDayStart] = useState(9)
  const [dayEnd, setDayEnd] = useState(21)
  const [transportMode, setTransportMode] = useState<TransportMode>('walking')
  const [startDate, setStartDate] = useState<string | undefined>(undefined)
  const [endDate, setEndDate] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!tripId) return
    async function load() {
      try {
        const trip = await getTrip(tripId!)
        setPlaces(trip.places ?? [])
        setDays(toDays(trip.itinerary))
        setDayStart(trip.day_start ?? 9)
        setDayEnd(trip.day_end ?? 21)
        setTransportMode((trip.transport_mode as TransportMode) ?? 'walking')
        setStartDate(trip.start_date)
        setEndDate(trip.end_date)
      } catch {
        setError('Trip not found or link has expired.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tripId])

  async function persist(nextPlaces: Place[]) {
    if (!tripId) return
    setBusy(true)
    try {
      const res = await updateTrip(tripId, {
        places: nextPlaces,
        day_start: dayStart,
        day_end: dayEnd,
        transport_mode: transportMode,
        start_date: startDate,
        end_date: endDate,
      })
      setPlaces(res.places ?? nextPlaces)
      setDays(toDays(res.itinerary))
    } catch {
      setError('Failed to update the shared trip.')
    } finally {
      setBusy(false)
    }
  }

  function handleAddPlace(place: Place) {
    if (places.some((p) => p.name === place.name)) return
    persist([...places, { ...place, selected: true }])
  }

  function handleRemoveStop(name: string) {
    persist(places.filter((p) => p.name !== name))
  }

  async function copyShareLink() {
    if (!tripId) return
    const url = `${window.location.origin}/trip/${tripId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 mt-3">Loading shared trip…</p>
        </div>
      </div>
    )
  }

  if (error && days.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">😕</p>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Trip not found</h2>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <Link
            to="/"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 underline-offset-2 hover:underline"
          >
            Plan your own trip →
          </Link>
        </div>
      </div>
    )
  }

  const activeDay = days[activeDayIndex] ?? days[0]
  const totalStops = days.reduce((sum, d) => sum + d.itinerary.length, 0)
  const shareUrl = `${window.location.origin}/trip/${tripId}`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <Link to="/" className="text-2xl font-bold text-indigo-600 tracking-tight hover:text-indigo-700">
              Pin
            </Link>
            <p className="text-sm text-gray-500 mt-0.5">Shared trip — anyone with this link can edit</p>
          </div>
          <Link
            to="/"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Plan your own trip
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Shared-trip banner */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-base flex-shrink-0">
              👥
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-900">This is a shared trip</p>
              <p className="text-xs text-emerald-700 truncate font-mono">{shareUrl}</p>
            </div>
          </div>
          <button
            onClick={copyShareLink}
            className="text-xs font-medium px-3 py-2 rounded-lg bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors whitespace-nowrap"
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>

        {/* Trip header */}
        <div className="flex items-end justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Trip itinerary</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {days.length} day{days.length !== 1 ? 's' : ''} · {totalStops} stop{totalStops !== 1 ? 's' : ''}
              {startDate && endDate && ` · ${startDate} → ${endDate}`}
            </p>
          </div>
          {busy && (
            <span className="text-xs text-indigo-600 font-medium">Syncing edits…</span>
          )}
        </div>

        {/* Day tabs */}
        {days.length > 1 && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {days.map((day) => (
              <button
                key={day.day_index}
                onClick={() => setActiveDayIndex(day.day_index)}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  day.day_index === activeDayIndex
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {formatTabLabel(day.date, day.day_index)}
                {!day.stats?.fits_in_day && (
                  <span className="ml-1.5 text-red-400 text-xs">!</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Conflicts */}
        {activeDay?.conflicts?.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <p className="font-medium mb-1">Conflicts on this day:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              {activeDay.conflicts.map((c, i) => (<li key={i}>{c}</li>))}
            </ul>
          </div>
        )}

        {/* Schedule + map */}
        {activeDay && (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex gap-4 text-sm text-gray-500 px-1 flex-wrap mb-4">
                <span><span className="font-medium text-gray-700">{activeDay.stats?.stops ?? 0}</span> stops</span>
                <span><span className="font-medium text-gray-700">{activeDay.stats?.total_hours ?? 0}h</span> scheduled</span>
                <span><span className="font-medium text-gray-700">{activeDay.stats?.total_travel_hours ?? 0}h</span> travel</span>
              </div>

              <div>
                {activeDay.itinerary.map((slot, i) => (
                  <SlotCard
                    key={slot.name}
                    slot={slot}
                    index={i + 1}
                    onRemove={() => handleRemoveStop(slot.name)}
                    removing={busy}
                  />
                ))}
                {activeDay.itinerary.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No stops on this day yet — add one below.</p>
                )}
              </div>
            </div>

            <div className="lg:w-96 lg:flex-shrink-0 h-80 lg:h-auto lg:min-h-[400px]">
              <MapPanel
                mode="itinerary"
                days={days}
                activeDayIndex={activeDayIndex}
              />
            </div>
          </div>
        )}

        {/* Add a place — basic edit affordance for collaborators */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Add a place to the trip</h3>
          <PlaceForm onAdd={handleAddPlace} />
        </div>

        {/* CTA */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-center">
          <p className="text-sm text-gray-600 mb-3">Want to make your own trip?</p>
          <Link
            to="/"
            className="inline-block text-sm font-semibold px-6 py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Start planning with Pin →
          </Link>
        </div>
      </main>
    </div>
  )
}
