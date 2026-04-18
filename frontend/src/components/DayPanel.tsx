import Timeline from './Timeline'
import OverflowSuggestions from './OverflowSuggestions'
import type { DayItinerary, ItinerarySlot, Place, TransportMode } from '../types'

interface Props {
  day: DayItinerary
  dayStart: number
  dayEnd: number
  totalDays: number
  places: Place[]
  transportMode: TransportMode
  onReorder: (dayIndex: number, newSlots: ItinerarySlot[]) => void
  onReschedule: (dayIndex: number, reorderedSlots: ItinerarySlot[]) => Promise<void>
  onDurationChange: (dayIndex: number, name: string, duration: number) => void
  onRemoveStop: (dayIndex: number, name: string) => void
  onMoveToNextDay: (fromDay: number, name: string) => void
}

function formatDayLabel(day: DayItinerary): string {
  if (!day.date) return `Day ${day.day_index + 1}`
  const d = new Date(day.date + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function DayPanel({
  day, dayStart, dayEnd, totalDays, places, transportMode,
  onReorder, onReschedule, onDurationChange, onRemoveStop, onMoveToNextDay,
}: Props) {
  const label = formatDayLabel(day)
  const stats = day.stats
  const hasConflicts = day.conflicts.length > 0

  return (
    <div className="space-y-3">
      {/* Day stats bar */}
      <div className="flex gap-4 text-sm text-gray-500 px-1 flex-wrap">
        <span><span className="font-medium text-gray-700">{stats.stops}</span> stops</span>
        <span><span className="font-medium text-gray-700">{stats.total_hours}h</span> scheduled</span>
        <span><span className="font-medium text-gray-700">{stats.total_travel_hours}h</span> travel</span>
        <span><span className="font-medium text-gray-700">{stats.free_hours}h</span> free</span>
        <span className={stats.fits_in_day ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
          {stats.fits_in_day ? 'Fits in day' : 'Overflows day'}
        </span>
      </div>

      {/* Conflicts (closed places, late arrivals) */}
      {hasConflicts && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          {day.conflicts.map((c, i) => <p key={i}>{c}</p>)}
        </div>
      )}

      {/* Schedule */}
      <Timeline
        itinerary={day.itinerary}
        dayStart={dayStart}
        dayEnd={dayEnd}
        dayLabel={label}
        dayIndex={day.day_index}
        places={places}
        transportMode={transportMode}
        onReorder={onReorder}
        onReschedule={onReschedule}
        onDurationChange={onDurationChange}
      />

      {/* Overflow suggestions */}
      <OverflowSuggestions
        day={day}
        totalDays={totalDays}
        onRemoveStop={onRemoveStop}
        onMoveToNextDay={day.day_index < totalDays - 1 ? onMoveToNextDay : undefined}
      />
    </div>
  )
}
