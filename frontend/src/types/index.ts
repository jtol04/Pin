export type PlaceCategory =
  | 'food'
  | 'museum'
  | 'park'
  | 'attraction'
  | 'shopping'
  | 'lodging'
  | 'other'

export type MealType = 'breakfast' | 'lunch' | 'dinner'

export type PlaceHours = { open: string; close: string } | null  // e.g. "0900", "2200"

export interface Place {
  name: string
  duration: number
  fixed_start?: number
  place_id?: string
  lat?: number
  lng?: number
  types?: string[]
  category?: PlaceCategory
  region?: string
  selected?: boolean      // defaults true; controls inclusion in generation
  day_index?: number      // set after multi-day generation
  opening_hours?: PlaceHours[]  // 7 entries, index 0=Sun...6=Sat
  meal_type?: MealType
}

export interface PlaceSuggestion {
  name: string
  place_id: string
  address: string
  lat: number
  lng: number
  suggested_duration: number
  duration_note: string
  types: string[]
  category: PlaceCategory
  region: string
  opening_hours?: PlaceHours[]
  meal_type?: MealType
}

export interface ItinerarySlot {
  name: string
  start: number
  end: number
  pinned: boolean
  travel_minutes: number
  place_id?: string
  lat?: number
  lng?: number
  category?: PlaceCategory
}

export interface ScheduleStats {
  stops: number
  total_hours: number
  total_travel_hours: number
  free_hours: number
  fits_in_day: boolean
}

export interface ScheduleResult {
  itinerary: ItinerarySlot[]
  conflicts: string[]
  stats: ScheduleStats
}

export type TransportMode = 'driving' | 'walking' | 'bicycling' | 'transit'

export interface ScheduleRequest {
  places: Place[]
  day_start?: number
  day_end?: number
  transport_mode?: TransportMode
  locked_order?: boolean
}

export interface DayItinerary {
  day_index: number
  date?: string           // ISO date e.g. "2026-04-14"
  itinerary: ItinerarySlot[]
  conflicts: string[]
  stats: ScheduleStats
  weather?: { condition: string; high_c: number; low_c: number }
}

export interface FoodCrawlSuggestion {
  places: string[]
  day_index: number
  reason: string
}

export interface MultiDayScheduleResult {
  days: DayItinerary[]
  food_crawl_suggestions: FoodCrawlSuggestion[]
  total_stats: ScheduleStats
}

export interface MultiDayScheduleRequest {
  places: Place[]
  day_start?: number
  day_end?: number
  transport_mode?: TransportMode
  start_date: string      // ISO date e.g. "2026-04-14"
  end_date: string        // ISO date e.g. "2026-04-16"
  selected_names?: string[]
}

export interface AutocompleteResult {
  place_id: string
  description: string
}

export interface Trip {
  id: string
  places: Place[]
  day_start: number
  day_end: number
  transport_mode: TransportMode
  itinerary?: ScheduleResult
}
