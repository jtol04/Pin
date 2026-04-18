import PlaceForm from './PlaceForm'
import PlaceGroupList from './PlaceGroupList'
import TripSettings from './TripSettings'
import MapPanel from './MapPanel'
import type { Place, TransportMode, MealType } from '../types'

interface Props {
  places: Place[]
  startDate: string
  endDate: string
  dayStart: number
  dayEnd: number
  transportMode: TransportMode
  loading: boolean
  onAdd: (place: Place) => void
  onRemove: (name: string) => void
  onToggleSelect: (name: string) => void
  onToggleGroup: (region: string, selected: boolean) => void
  onMealTypeChange: (name: string, mealType: MealType | undefined) => void
  onDatesChange: (startDate: string, endDate: string) => void
  onDayChange: (dayStart: number, dayEnd: number, transportMode: TransportMode) => void
  onCreateItinerary: () => void
}

function numDays(start: string, end: string): number {
  if (!start || !end) return 0
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.round(diff) + 1)
}

export default function StagingView({
  places,
  startDate,
  endDate,
  dayStart,
  dayEnd,
  transportMode,
  loading,
  onAdd,
  onRemove,
  onToggleSelect,
  onToggleGroup,
  onMealTypeChange,
  onDatesChange,
  onDayChange,
  onCreateItinerary,
}: Props) {
  const selectedCount = places.filter((p) => p.selected !== false).length
  const days = numDays(startDate, endDate)
  const canGenerate = selectedCount > 0 && days > 0 && !loading

  return (
    <div className="space-y-6">
      {/* Trip settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Trip details</h2>
        <TripSettings
          startDate={startDate}
          endDate={endDate}
          dayStart={dayStart}
          dayEnd={dayEnd}
          transportMode={transportMode}
          onDatesChange={onDatesChange}
          onDayChange={onDayChange}
        />
      </div>

      {/* Add a place */}
      <PlaceForm onAdd={onAdd} />

      {/* Side-by-side: place list + map */}
      {places.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: place list */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">
                Places ({places.length})
              </h2>
              <span className="text-sm text-gray-500">
                {selectedCount} selected
              </span>
            </div>
            <PlaceGroupList
              places={places}
              onRemove={onRemove}
              onToggleSelect={onToggleSelect}
              onToggleGroup={onToggleGroup}
              onMealTypeChange={onMealTypeChange}
            />
          </div>

          {/* Right: map */}
          <div className="lg:w-96 lg:flex-shrink-0 h-80 lg:h-auto lg:min-h-[400px]">
            <MapPanel mode="staging" places={places} />
          </div>
        </div>
      )}

      {/* Create itinerary CTA */}
      {places.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={onCreateItinerary}
            disabled={!canGenerate}
            className={`px-6 py-3 rounded-xl font-semibold text-sm transition-colors shadow-sm ${
              canGenerate
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {loading
              ? 'Building itinerary…'
              : !days
              ? 'Set trip dates to continue'
              : `Create ${days}-day itinerary →`}
          </button>
        </div>
      )}
    </div>
  )
}
