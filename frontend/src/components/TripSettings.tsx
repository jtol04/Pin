import type { TransportMode } from '../types'
import DaySettings from './DaySettings'

interface Props {
  startDate: string        // ISO date e.g. "2026-04-14"
  endDate: string
  dayStart: number
  dayEnd: number
  transportMode: TransportMode
  onDatesChange: (startDate: string, endDate: string) => void
  onDayChange: (dayStart: number, dayEnd: number, transportMode: TransportMode) => void
}

function numDays(start: string, end: string): number {
  if (!start || !end) return 0
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.round(diff) + 1)
}

export default function TripSettings({
  startDate,
  endDate,
  dayStart,
  dayEnd,
  transportMode,
  onDatesChange,
  onDayChange,
}: Props) {
  const days = numDays(startDate, endDate)

  function handleStart(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    // Don't allow start after end
    if (endDate && val > endDate) return
    onDatesChange(val, endDate)
  }

  function handleEnd(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    if (startDate && val < startDate) return
    onDatesChange(startDate, val)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Date range */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-gray-500">From</span>
          <input
            type="date"
            value={startDate}
            onChange={handleStart}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </label>
        <span className="text-gray-300 text-sm">–</span>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-gray-500">To</span>
          <input
            type="date"
            value={endDate}
            onChange={handleEnd}
            min={startDate}
            className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </label>
        {days > 0 && (
          <span className="text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full">
            {days} day{days !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Day time window + transport */}
      <DaySettings
        dayStart={dayStart}
        dayEnd={dayEnd}
        transportMode={transportMode}
        onChange={onDayChange}
      />
    </div>
  )
}
