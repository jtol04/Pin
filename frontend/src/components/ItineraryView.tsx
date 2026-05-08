import { useState } from 'react'
import DayPanel from './DayPanel'
import MapPanel from './MapPanel'
import TripShare from './TripShare'
import RecommendationsPanel from './RecommendationsPanel'
import { createTrip } from '../api/client'
import type { MultiDayScheduleResult, ItinerarySlot, Place, TransportMode } from '../types'

interface Props {
  result: MultiDayScheduleResult
  dayStart: number
  dayEnd: number
  places: Place[]
  transportMode: TransportMode
  onReorder: (dayIndex: number, newSlots: ItinerarySlot[]) => void
  onReschedule: (dayIndex: number, reorderedSlots: ItinerarySlot[]) => Promise<void>
  onDurationChange: (dayIndex: number, name: string, duration: number) => void
  onRemoveStop: (dayIndex: number, name: string) => void
  onMoveToNextDay: (fromDay: number, name: string) => void
  onEditPlaces: () => void
  onAddRecommendedPlace: (place: Place) => void
}

function formatTabLabel(date: string | undefined, dayIndex: number): string {
  if (!date) return `Day ${dayIndex + 1}`
  const d = new Date(date + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function ItineraryView({
  result, dayStart, dayEnd, places, transportMode,
  onReorder, onReschedule, onDurationChange, onRemoveStop, onMoveToNextDay, onEditPlaces,
  onAddRecommendedPlace,
}: Props) {
  const [activeDayIndex, setActiveDayIndex] = useState(0)
  const [dismissedCrawls, setDismissedCrawls] = useState<Set<string>>(new Set())
  const [tripId, setTripId] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  async function handleShare() {
    setSharing(true)
    try {
      const res = await createTrip(places, dayStart, dayEnd, transportMode)
      setTripId(res.id)
    } catch {
      // silent
    } finally {
      setSharing(false)
    }
  }

  const activeDay = result.days[activeDayIndex] ?? result.days[0]

  const activeCrawls = result.food_crawl_suggestions.filter(
    (s) => s.day_index === activeDay.day_index,
  )

  function dismissCrawl(key: string) {
    setDismissedCrawls((prev) => new Set(prev).add(key))
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Your itinerary</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {result.days.length} day{result.days.length !== 1 ? 's' : ''} · {result.total_stats.stops} stops
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!tripId && (
            <button
              onClick={handleShare}
              disabled={sharing}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors disabled:text-gray-400"
            >
              {sharing ? 'Creating link…' : 'Share trip'}
            </button>
          )}
          <button
            onClick={onEditPlaces}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium underline-offset-2 hover:underline"
          >
            ← Edit places
          </button>
        </div>
      </div>

      {/* Share link */}
      {tripId && <TripShare tripId={tripId} />}

      {/* Day tabs */}
      {result.days.length > 1 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {result.days.map((day) => (
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
              {!day.stats.fits_in_day && (
                <span className="ml-1.5 text-red-400 text-xs">!</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Food crawl banners */}
      {activeCrawls
        .filter((c) => !dismissedCrawls.has(`${c.day_index}-${c.places.join()}`))
        .map((c) => {
          const key = `${c.day_index}-${c.places.join()}`
          return (
            <div
              key={key}
              className="bg-orange-50 border border-orange-200 text-orange-800 text-sm rounded-xl px-4 py-3 flex items-start justify-between gap-3"
            >
              <p>
                <span className="font-medium">Food crawl opportunity — </span>
                {c.places.join(', ')} are {c.reason}
              </p>
              <button
                onClick={() => dismissCrawl(key)}
                className="text-orange-400 hover:text-orange-700 text-lg leading-none flex-shrink-0"
                aria-label="Dismiss"
              >
                &times;
              </button>
            </div>
          )
        })}

      {/* Side-by-side: day panel + map */}
      {activeDay && (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: schedule */}
          <div className="flex-1 min-w-0">
            <DayPanel
              day={activeDay}
              dayStart={dayStart}
              dayEnd={dayEnd}
              totalDays={result.days.length}
              places={places}
              transportMode={transportMode}
              onReorder={onReorder}
              onReschedule={onReschedule}
              onDurationChange={onDurationChange}
              onRemoveStop={onRemoveStop}
              onMoveToNextDay={onMoveToNextDay}
            />
          </div>

          {/* Right: map */}
          <div className="lg:w-96 lg:flex-shrink-0 h-80 lg:h-auto lg:min-h-[400px]">
            <MapPanel
              mode="itinerary"
              days={result.days}
              activeDayIndex={activeDayIndex}
            />
          </div>
        </div>
      )}

      {/* Tailored recommendations (sponsored placements) */}
      <RecommendationsPanel places={places} onAddPlace={onAddRecommendedPlace} />
    </div>
  )
}
