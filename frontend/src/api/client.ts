import type {
  ScheduleRequest,
  ScheduleResult,
  PlaceSuggestion,
  AutocompleteResult,
  Trip,
  Place,
  MultiDayScheduleRequest,
  MultiDayScheduleResult,
} from '../types'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
  return res.json()
}

// ── Itinerary ──────────────────────────────────────────────────────────────

export async function generateItinerary(request: ScheduleRequest): Promise<ScheduleResult> {
  return post('/itinerary/generate', request)
}

export async function removeAndReschedule(
  request: ScheduleRequest,
  removeName: string,
): Promise<ScheduleResult> {
  return post('/itinerary/remove', { ...request, remove: removeName })
}

export async function generateMultiDayItinerary(
  request: MultiDayScheduleRequest,
): Promise<MultiDayScheduleResult> {
  return post('/itinerary/generate-multiday', request)
}

// ── Places ─────────────────────────────────────────────────────────────────

export async function autocomplete(q: string): Promise<AutocompleteResult[]> {
  const res = await fetch(`/places/autocomplete?q=${encodeURIComponent(q)}`)
  if (!res.ok) return []
  const data = await res.json()
  return data.predictions ?? []
}

export async function suggestPlace(place_id: string, name: string): Promise<PlaceSuggestion> {
  return post('/places/suggest', { place_id, name })
}

// ── Trips (persistence + sharing) ─────────────────────────────────────────

export async function createTrip(
  places: Place[],
  day_start: number,
  day_end: number,
  transport_mode: string,
): Promise<{ id: string; itinerary?: ScheduleResult }> {
  return post('/trips/', { places, day_start, day_end, transport_mode })
}

export async function getTrip(id: string): Promise<Trip> {
  const res = await fetch(`/trips/${id}`)
  if (!res.ok) throw new Error(`Trip ${id} not found`)
  return res.json()
}

export async function updateTrip(
  id: string,
  places: Place[],
  day_start: number,
  day_end: number,
  transport_mode: string,
): Promise<{ itinerary: ScheduleResult }> {
  const res = await fetch(`/trips/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ places, day_start, day_end, transport_mode }),
  })
  if (!res.ok) throw new Error(`updateTrip failed: ${res.status}`)
  return res.json()
}
