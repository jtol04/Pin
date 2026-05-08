import { useState } from 'react'
import PlaceForm from './PlaceForm'
import SocialImport from './SocialImport'
import PlaceGroupList from './PlaceGroupList'
import TripSettings from './TripSettings'
import MapPanel from './MapPanel'
import { suggestPlace } from '../api/client'
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

const DEMO_PLACES: { place_id: string; name: string; meal_type?: MealType }[] = [
  { place_id: "ChIJb8Jg9pZYwokR-qHGtvSkLzs", name: "Central Park" },
  { place_id: "ChIJmQJIxlNYwokRLgeuocVOGVU", name: "The Metropolitan Museum of Art" },
  { place_id: "ChIJ4zGFAZpYwokRGUGph3Mf37k", name: "Times Square" },
  { place_id: "ChIJhR5DGkBawokRRGIkkChP3qs", name: "Brooklyn Bridge" },
  { place_id: "ChIJy7cGfBlawokR2MVMmJfn1HU", name: "One World Observatory" },
  { place_id: "ChIJx8DrP5ZYwokRUpXr49t9n3A", name: "Chelsea Market" },
  { place_id: "ChIJPTacEpBQwokRKwIlDXelxkA", name: "Statue of Liberty" },
  { place_id: "ChIJ5bQPhMdZwokRkTwKhVxhP1g", name: "High Line" },
]

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
  const [demoLoading, setDemoLoading] = useState(false)
  const selectedCount = places.filter((p) => p.selected !== false).length
  const days = numDays(startDate, endDate)
  const canGenerate = selectedCount > 0 && days > 0 && !loading

  async function loadDemo() {
    setDemoLoading(true)
    onDatesChange('2026-05-15', '2026-05-17')
    for (const dp of DEMO_PLACES) {
      try {
        const s = await suggestPlace(dp.place_id, dp.name)
        onAdd({
          name: s.name,
          duration: s.suggested_duration,
          place_id: dp.place_id,
          lat: s.lat,
          lng: s.lng,
          types: s.types,
          category: s.category,
          region: s.region,
          opening_hours: s.opening_hours,
          meal_type: dp.meal_type,
          selected: true,
        })
      } catch {
        onAdd({ name: dp.name, duration: 1.5, place_id: dp.place_id, selected: true })
      }
    }
    setDemoLoading(false)
  }

  return (
    <div className="space-y-6">
      {/* Trip settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Trip details</h2>
          {places.length === 0 && (
            <button
              onClick={loadDemo}
              disabled={demoLoading}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors disabled:text-gray-400"
            >
              {demoLoading ? 'Loading demo…' : 'Load NYC Demo Trip →'}
            </button>
          )}
        </div>
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

      {/* Import from social media */}
      <SocialImport onAdd={onAdd} />

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
