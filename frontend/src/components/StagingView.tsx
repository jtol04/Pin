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

interface DemoSeed {
  // Either look up via Google place_id (real ChIJ... IDs) or hand-roll the
  // Place inline (used for Katz's, Tenement Museum, etc. — places we don't
  // want to round-trip through Maps).
  place_id?: string
  name?: string
  inline?: Place
  meal_type?: MealType
  fixed_start?: number  // hours since midnight, e.g. 19 = 7pm
}

interface DemoScenario {
  id: string
  label: string
  subtitle: string
  dates: [string, string]
  transport: TransportMode
  places: DemoSeed[]
}

// Inline Places used by demos that don't go through Google Places.
const KATZS_INLINE: Place = {
  name: "Katz's Delicatessen",
  duration: 1.0,
  place_id: 'demo-katzs',
  lat: 40.7223, lng: -73.9874,
  types: ['restaurant', 'food'],
  category: 'food',
  region: 'Lower East Side',
  meal_type: 'dinner',
  selected: true,
}
const TENEMENT_INLINE: Place = {
  name: 'Tenement Museum',
  duration: 1.5,
  place_id: 'demo-tenement',
  lat: 40.7187, lng: -73.9909,
  types: ['museum', 'tourist_attraction'],
  category: 'museum',
  region: 'Lower East Side',
  selected: true,
}
const WASHINGTON_SQUARE_INLINE: Place = {
  name: 'Washington Square Park',
  duration: 1.0,
  place_id: 'demo-washington-sq',
  lat: 40.7308, lng: -73.9973,
  types: ['park', 'tourist_attraction'],
  category: 'park',
  region: 'Greenwich Village',
  selected: true,
}
const JOES_PIZZA_INLINE: Place = {
  name: "Joe's Pizza",
  duration: 0.5,
  place_id: 'demo-joes-pizza',
  lat: 40.7305, lng: -74.0027,
  types: ['restaurant', 'food'],
  category: 'food',
  region: 'West Village',
  meal_type: 'lunch',
  selected: true,
}
const LOS_TACOS_INLINE: Place = {
  name: 'Los Tacos No. 1',
  duration: 0.75,
  place_id: 'demo-los-tacos',
  lat: 40.7421, lng: -74.0061,
  types: ['restaurant', 'food'],
  category: 'food',
  region: 'Chelsea',
  meal_type: 'lunch',
  selected: true,
}
const LEVAIN_INLINE: Place = {
  name: 'Levain Bakery',
  duration: 0.5,
  place_id: 'demo-levain',
  lat: 40.7794, lng: -73.9810,
  types: ['bakery', 'food'],
  category: 'food',
  region: 'Upper West Side',
  meal_type: 'breakfast',
  selected: true,
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'nyc-classic',
    label: 'NYC Classic',
    subtitle: '3-day tour · 8 must-see spots',
    dates: ['2026-05-15', '2026-05-17'],
    transport: 'walking',
    places: [
      { place_id: "ChIJ4zGFAZpYwokRGUGph3Mf37k", name: "Central Park" },
      { place_id: "ChIJb8Jg9pZYwokR-qHGtvSkLzs", name: "The Metropolitan Museum of Art" },
      { place_id: "ChIJmQJIxlVYwokRLgeuocVOGVU", name: "Times Square" },
      { place_id: "ChIJK3vOQyNawokRXEa9errdJiU", name: "Brooklyn Bridge" },
      { place_id: "ChIJTWE_0BtawokRVJNGH5RS448", name: "One World Observatory" },
      { place_id: "ChIJw2lMFL9ZwokRosAtly52YX4", name: "Chelsea Market" },
      { place_id: "ChIJPTacEpBQwokRKwIlDXelxkA", name: "Statue of Liberty" },
      { place_id: "ChIJ5bQPhMdZwokRkTwKhVxhP1g", name: "High Line" },
    ],
  },
  {
    id: 'family',
    label: 'Family Vacation',
    subtitle: 'Parents pin reservations · kids fill the gaps',
    dates: ['2026-05-15', '2026-05-16'],
    transport: 'transit',
    places: [
      // Parents' fixed reservations
      { place_id: "ChIJb8Jg9pZYwokR-qHGtvSkLzs", name: "The Metropolitan Museum of Art", fixed_start: 10 },  // 10am museum tour
      { inline: KATZS_INLINE, fixed_start: 19 },                                                              // 7pm Katz's dinner
      // Kids' flexible picks
      { place_id: "ChIJ4zGFAZpYwokRGUGph3Mf37k", name: "Central Park" },
      { place_id: "ChIJmQJIxlVYwokRLgeuocVOGVU", name: "Times Square" },
      { place_id: "ChIJw2lMFL9ZwokRosAtly52YX4", name: "Chelsea Market", meal_type: 'lunch' },
      { place_id: "ChIJ5bQPhMdZwokRkTwKhVxhP1g", name: "High Line" },
    ],
  },
  {
    id: 'solo',
    label: 'Solo First-Time Traveler',
    subtitle: 'Saved IG + TikTok posts → instant trip',
    dates: ['2026-05-15', '2026-05-16'],
    transport: 'transit',
    places: [
      // From the Instagram NYC food crawl import
      { inline: JOES_PIZZA_INLINE },
      { inline: LOS_TACOS_INLINE },
      { inline: LEVAIN_INLINE },
      // Headline sights every first-timer pairs with food
      { place_id: "ChIJmQJIxlVYwokRLgeuocVOGVU", name: "Times Square" },
      { place_id: "ChIJK3vOQyNawokRXEa9errdJiU", name: "Brooklyn Bridge" },
      { place_id: "ChIJ4zGFAZpYwokRGUGph3Mf37k", name: "Central Park" },
    ],
  },
  {
    id: 'advertiser',
    label: 'Local Business Advertiser',
    subtitle: "LES stop · Katz's lands in Recommended",
    dates: ['2026-05-15', '2026-05-16'],
    transport: 'walking',
    places: [
      { inline: TENEMENT_INLINE },           // anchors the trip in the Lower East Side
      { inline: WASHINGTON_SQUARE_INLINE },
      { place_id: "ChIJK3vOQyNawokRXEa9errdJiU", name: "Brooklyn Bridge" },
      { place_id: "ChIJ5bQPhMdZwokRkTwKhVxhP1g", name: "High Line" },
    ],
  },
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
  const [demoLoading, setDemoLoading] = useState<string | null>(null)
  const [showDemos, setShowDemos] = useState(false)
  const selectedCount = places.filter((p) => p.selected !== false).length
  const days = numDays(startDate, endDate)
  const canGenerate = selectedCount > 0 && days > 0 && !loading

  async function loadDemo(scenario: DemoScenario) {
    setDemoLoading(scenario.id)
    setShowDemos(false)
    onDatesChange(scenario.dates[0], scenario.dates[1])
    onDayChange(dayStart, dayEnd, scenario.transport)
    for (const dp of scenario.places) {
      // Inline-defined places skip the backend roundtrip — used for places
      // that don't have real Google IDs (Katz's, Tenement Museum, etc.)
      if (dp.inline) {
        onAdd({
          ...dp.inline,
          meal_type: dp.meal_type ?? dp.inline.meal_type,
          fixed_start: dp.fixed_start ?? dp.inline.fixed_start,
          selected: true,
        })
        continue
      }
      if (!dp.place_id) continue
      try {
        const s = await suggestPlace(dp.place_id, dp.name ?? '')
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
          meal_type: dp.meal_type ?? s.meal_type,
          fixed_start: dp.fixed_start,
          selected: true,
        })
      } catch {
        onAdd({
          name: dp.name ?? 'Unknown',
          duration: 1.5,
          place_id: dp.place_id,
          meal_type: dp.meal_type,
          fixed_start: dp.fixed_start,
          selected: true,
        })
      }
    }
    setDemoLoading(null)
  }

  return (
    <div className="space-y-6">
      {/* Trip settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Trip details</h2>
          {places.length === 0 && (
            <div className="relative">
              <button
                onClick={() => setShowDemos((v) => !v)}
                disabled={!!demoLoading}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors disabled:text-gray-400"
              >
                {demoLoading ? 'Loading demo…' : 'Load demo trip ▾'}
              </button>
              {showDemos && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  {DEMO_SCENARIOS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => loadDemo(s)}
                      className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      <span className="text-sm font-medium text-gray-800">{s.label}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{s.subtitle}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
