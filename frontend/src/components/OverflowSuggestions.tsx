import type { DayItinerary } from '../types'

interface Props {
  day: DayItinerary
  totalDays: number
  onRemoveStop: (dayIndex: number, name: string) => void
  onMoveToNextDay?: (fromDay: number, name: string) => void
}

export default function OverflowSuggestions({ day, totalDays, onRemoveStop, onMoveToNextDay }: Props) {
  if (day.stats.fits_in_day || day.itinerary.length === 0) return null

  const last = day.itinerary[day.itinerary.length - 1]
  const durationH = Math.round((last.end - last.start) * 10) / 10
  const canMoveNext = day.day_index < totalDays - 1 && !!onMoveToNextDay

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-2">
      <p className="text-sm font-medium text-red-700">Day overflows — suggestions:</p>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => onRemoveStop(day.day_index, last.name)}
          className="text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors text-left"
        >
          Remove <span className="font-medium">{last.name}</span> and save {durationH}h
        </button>

        {canMoveNext && (
          <button
            onClick={() => onMoveToNextDay!(day.day_index, last.name)}
            className="text-xs bg-white border border-red-200 text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors text-left"
          >
            Move <span className="font-medium">{last.name}</span> to Day {day.day_index + 2}
          </button>
        )}
      </div>
    </div>
  )
}
