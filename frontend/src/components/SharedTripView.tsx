import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import MapPanel from './MapPanel'
import { getTrip } from '../api/client'
import type { Place, DayItinerary, ItinerarySlot } from '../types'

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

function SlotCard({ slot, index }: { slot: ItinerarySlot; index: number }) {
  const emoji = CATEGORY_EMOJI[slot.category ?? ''] ?? '📍'
  const durationMin = Math.round((slot.end - slot.start) * 60)

  return (
    <div className="flex items-start gap-4">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center pt-1">
        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
          {index}
        </div>
        <div className="w-0.5 bg-gray-200 flex-1 mt-1" />
      </div>

      {/* Card */}
      <div className="flex-1 bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm mb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">
            {emoji} {slot.name}
          </h3>
          <span className="text-xs text-gray-400">{durationMin} min</span>
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

  useEffect(() => {
    if (!tripId) return
    async function load() {
      try {
        const trip = await getTrip(tripId!)
        setPlaces(trip.places ?? [])

        if (trip.itinerary?.itinerary) {
          setDays([{
            day_index: 0,
            itinerary: trip.itinerary.itinerary,
            conflicts: trip.itinerary.conflicts ?? [],
            stats: trip.itinerary.stats ?? { stops: 0, total_hours: 0, total_travel_hours: 0, free_hours: 0, fits_in_day: true },
          }])
        }
      } catch {
        setError('Trip not found or link has expired.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tripId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 mt-3">Loading trip…</p>
        </div>
      </div>
    )
  }

  if (error) {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <Link to="/" className="text-2xl font-bold text-indigo-600 tracking-tight hover:text-indigo-700">
              Pin
            </Link>
            <p className="text-sm text-gray-500 mt-0.5">Shared trip itinerary</p>
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
        {/* Trip header */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Trip itinerary</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {days.length} day{days.length !== 1 ? 's' : ''} · {totalStops} stop{totalStops !== 1 ? 's' : ''}
          </p>
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
              </button>
            ))}
          </div>
        )}

        {/* Content: schedule + map */}
        {activeDay && (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left: read-only schedule */}
            <div className="flex-1 min-w-0">
              {/* Day stats */}
              <div className="flex gap-4 text-sm text-gray-500 px-1 flex-wrap mb-4">
                <span><span className="font-medium text-gray-700">{activeDay.stats.stops}</span> stops</span>
                <span><span className="font-medium text-gray-700">{activeDay.stats.total_hours}h</span> scheduled</span>
                <span><span className="font-medium text-gray-700">{activeDay.stats.total_travel_hours}h</span> travel</span>
              </div>

              {/* Slots */}
              <div>
                {activeDay.itinerary.map((slot, i) => (
                  <SlotCard key={slot.name} slot={slot} index={i + 1} />
                ))}
              </div>
            </div>

            {/* Right: map */}
            <div className="lg:w-96 lg:flex-shrink-0 h-80 lg:h-auto lg:min-h-[400px]">
              <MapPanel
                mode="itinerary"
                days={days}
                activeDayIndex={activeDayIndex}
              />
            </div>
          </div>
        )}

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
