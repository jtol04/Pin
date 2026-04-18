import type { Place, PlaceCategory, MealType } from '../types'

interface Props {
  places: Place[]
  onRemove: (name: string) => void
  onToggleSelect: (name: string) => void
  onToggleGroup: (region: string, selected: boolean) => void
  onMealTypeChange: (name: string, mealType: MealType | undefined) => void
}

const MEAL_CYCLE: Array<MealType | undefined> = ['breakfast', 'lunch', 'dinner', undefined]

const MEAL_STYLE: Record<string, { icon: string; bg: string; text: string; label: string }> = {
  breakfast: { icon: '🌅', bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Breakfast' },
  lunch:     { icon: '☀️', bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Lunch'     },
  dinner:    { icon: '🌙', bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Dinner'    },
}

const CATEGORY_STYLE: Record<PlaceCategory, { bg: string; text: string; label: string }> = {
  food:       { bg: 'bg-orange-100',  text: 'text-orange-700', label: 'Food'       },
  museum:     { bg: 'bg-purple-100',  text: 'text-purple-700', label: 'Museum'     },
  park:       { bg: 'bg-green-100',   text: 'text-green-700',  label: 'Park'       },
  attraction: { bg: 'bg-indigo-100',  text: 'text-indigo-700', label: 'Attraction' },
  shopping:   { bg: 'bg-yellow-100',  text: 'text-yellow-700', label: 'Shopping'   },
  lodging:    { bg: 'bg-sky-100',     text: 'text-sky-700',    label: 'Lodging'    },
  other:      { bg: 'bg-gray-100',    text: 'text-gray-600',   label: 'Other'      },
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

function groupByRegion(places: Place[]): Map<string, Place[]> {
  const map = new Map<string, Place[]>()
  for (const place of places) {
    const key = place.region || 'Other'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(place)
  }
  return map
}

export default function PlaceGroupList({ places, onRemove, onToggleSelect, onToggleGroup, onMealTypeChange }: Props) {
  if (places.length === 0) return null

  const groups = groupByRegion(places)

  return (
    <div className="space-y-5">
      {Array.from(groups.entries()).map(([region, regionPlaces]) => {
        const allSelected = regionPlaces.every((p) => p.selected !== false)
        const totalHrs = regionPlaces.reduce((s, p) => s + p.duration, 0)

        return (
          <div key={region}>
            {/* Group header */}
            <div className="flex items-center gap-3 mb-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onToggleGroup(region, e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                title={allSelected ? 'Deselect all in group' : 'Select all in group'}
              />
              <h3 className="text-sm font-semibold text-gray-700">
                {region}
              </h3>
              <span className="text-xs text-gray-400">
                {regionPlaces.length} place{regionPlaces.length !== 1 ? 's' : ''} · ~{Math.round(totalHrs * 10) / 10} hrs
              </span>
            </div>

            {/* Place cards */}
            <div className="flex flex-wrap gap-3 pl-7">
              {regionPlaces.map((place) => {
                const isSelected = place.selected !== false
                const cat = place.category as PlaceCategory | undefined
                const catStyle = cat ? CATEGORY_STYLE[cat] : CATEGORY_STYLE.other

                return (
                  <div
                    key={place.name}
                    className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 shadow-sm transition-opacity ${
                      isSelected ? 'border-gray-200 opacity-100' : 'border-gray-100 opacity-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(place.name)}
                      className="w-4 h-4 rounded accent-indigo-600 cursor-pointer flex-shrink-0"
                    />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-800">{place.name}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${catStyle.bg} ${catStyle.text}`}>
                          {catStyle.label}
                        </span>
                        {place.category === 'food' && (() => {
                          const ms = place.meal_type ? MEAL_STYLE[place.meal_type] : null
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                const curr = MEAL_CYCLE.indexOf(place.meal_type)
                                const next = MEAL_CYCLE[(curr + 1) % MEAL_CYCLE.length]
                                onMealTypeChange(place.name, next)
                              }}
                              title="Tap to cycle meal time"
                              className={`text-xs px-1.5 py-0.5 rounded-full font-medium cursor-pointer transition-colors ${
                                ms ? `${ms.bg} ${ms.text}` : 'bg-gray-100 text-gray-400'
                              }`}
                            >
                              {ms ? `${ms.icon} ${ms.label}` : '+ meal time'}
                            </button>
                          )
                        })()}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
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
                      className="text-gray-400 hover:text-red-500 transition-colors ml-1 text-lg leading-none flex-shrink-0"
                      aria-label={`Remove ${place.name}`}
                    >
                      &times;
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
