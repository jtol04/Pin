import type { TransportMode } from '../types'

interface Props {
  dayStart: number
  dayEnd: number
  transportMode: TransportMode
  onChange: (dayStart: number, dayEnd: number, transportMode: TransportMode) => void
}

function decimalToTime(h: number): string {
  const hours = Math.floor(h)
  const minutes = Math.round((h - hours) * 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function timeToDecimal(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h + m / 60
}

const MODES: { value: TransportMode; label: string; icon: string }[] = [
  { value: 'walking',   label: 'Walk',    icon: '🚶' },
  { value: 'transit',   label: 'Transit', icon: '🚇' },
  { value: 'driving',   label: 'Drive',   icon: '🚗' },
  { value: 'bicycling', label: 'Bike',    icon: '🚲' },
]

export default function DaySettings({ dayStart, dayEnd, transportMode, onChange }: Props) {
  function handleStart(e: React.ChangeEvent<HTMLInputElement>) {
    const val = timeToDecimal(e.target.value)
    if (val < dayEnd) onChange(val, dayEnd, transportMode)
  }

  function handleEnd(e: React.ChangeEvent<HTMLInputElement>) {
    const val = timeToDecimal(e.target.value)
    if (val > dayStart) onChange(dayStart, val, transportMode)
  }

  function handleMode(mode: TransportMode) {
    onChange(dayStart, dayEnd, mode)
  }

  return (
    <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
      {/* Mode selector */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => handleMode(m.value)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              transportMode === m.value
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
            title={m.label}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {/* Time range */}
      <label className="flex items-center gap-2">
        <span className="text-gray-500">Start</span>
        <input
          type="time"
          value={decimalToTime(dayStart)}
          onChange={handleStart}
          className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </label>
      <span className="text-gray-300">–</span>
      <label className="flex items-center gap-2">
        <span className="text-gray-500">End</span>
        <input
          type="time"
          value={decimalToTime(dayEnd)}
          onChange={handleEnd}
          className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </label>
    </div>
  )
}
