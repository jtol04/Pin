import type { Place } from '../types'

interface Props {
  places: Place[]
  onRemove: (name: string) => void
}

function fmtHours(h: number): string {
  if (h === 1) return '1 hr'
  if (Number.isInteger(h)) return `${h} hrs`
  return `${h} hrs`
}

function fmtFixed(h: number): string {
  const total = Math.round(h * 60)
  const hour = Math.floor(total / 60)
  const minute = total % 60
  const period = hour < 12 ? 'am' : 'pm'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${String(minute).padStart(2, '0')}${period}`
}

export default function PlaceList({ places, onRemove }: Props) {
  if (places.length === 0) return null

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-3">Places ({places.length})</h2>
      <div className="flex flex-wrap gap-3">
        {places.map((place) => (
          <div
            key={place.name}
            className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm"
          >
            <div>
              <p className="text-sm font-medium text-gray-800">{place.name}</p>
              <p className="text-xs text-gray-500">
                {fmtHours(place.duration)}
                {place.fixed_start !== undefined && (
                  <span className="ml-2 text-teal-600 font-medium">
                    pinned {fmtFixed(place.fixed_start)}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => onRemove(place.name)}
              className="text-gray-400 hover:text-red-500 transition-colors ml-1 text-lg leading-none"
              aria-label={`Remove ${place.name}`}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
