import { useState } from 'react'
import StagingView from './components/StagingView'
import ItineraryView from './components/ItineraryView'
import { generateItinerary, generateMultiDayItinerary } from './api/client'
import type { Place, MultiDayScheduleResult, TransportMode, ItinerarySlot, MealType } from './types'

type AppStage = 'staging' | 'itinerary'

export default function App() {
  // ── Stage ──────────────────────────────────────────────────────────────────
  const [stage, setStage] = useState<AppStage>('staging')

  // ── Trip places ────────────────────────────────────────────────────────────
  const [places, setPlaces] = useState<Place[]>([])

  // ── Trip settings ──────────────────────────────────────────────────────────
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [dayStart, setDayStart] = useState(9.0)
  const [dayEnd, setDayEnd] = useState(21.0)
  const [transportMode, setTransportMode] = useState<TransportMode>('driving')

  // ── Result ─────────────────────────────────────────────────────────────────
  const [multiDayResult, setMultiDayResult] = useState<MultiDayScheduleResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Staging handlers ───────────────────────────────────────────────────────

  function handleAdd(place: Place) {
    setPlaces((prev) => [...prev, { ...place, selected: true }])
  }

  function handleRemove(name: string) {
    setPlaces((prev) => prev.filter((p) => p.name !== name))
  }

  function handleToggleSelect(name: string) {
    setPlaces((prev) =>
      prev.map((p) => (p.name === name ? { ...p, selected: !(p.selected ?? true) } : p)),
    )
  }

  function handleToggleGroup(region: string, selected: boolean) {
    setPlaces((prev) =>
      prev.map((p) => ((p.region || 'Other') === region ? { ...p, selected } : p)),
    )
  }

  function handleMealTypeChange(name: string, mealType: MealType | undefined) {
    setPlaces((prev) =>
      prev.map((p) => (p.name === name ? { ...p, meal_type: mealType } : p)),
    )
  }

  function handleDatesChange(s: string, e: string) {
    setStartDate(s)
    setEndDate(e)
  }

  function handleDayChange(start: number, end: number, mode: TransportMode) {
    setDayStart(start)
    setDayEnd(end)
    setTransportMode(mode)
  }

  // ── Generate itinerary ─────────────────────────────────────────────────────

  async function handleCreateItinerary() {
    setLoading(true)
    setError(null)
    try {
      const selectedNames = places
        .filter((p) => p.selected !== false)
        .map((p) => p.name)

      const result = await generateMultiDayItinerary({
        places,
        day_start: dayStart,
        day_end: dayEnd,
        transport_mode: transportMode,
        start_date: startDate,
        end_date: endDate,
        selected_names: selectedNames,
      })
      setMultiDayResult(result)
      setStage('itinerary')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate itinerary')
    } finally {
      setLoading(false)
    }
  }

  // ── Itinerary edit handlers ────────────────────────────────────────────────

  function handleReorder(dayIndex: number, newSlots: ItinerarySlot[]) {
    if (!multiDayResult) return
    setMultiDayResult({
      ...multiDayResult,
      days: multiDayResult.days.map((d) =>
        d.day_index === dayIndex ? { ...d, itinerary: newSlots } : d,
      ),
    })
  }

  async function handleDurationChange(dayIndex: number, name: string, newDuration: number) {
    // Update place duration in staging state
    setPlaces((prev) => prev.map((p) => (p.name === name ? { ...p, duration: newDuration } : p)))

    // Re-schedule the day using the new duration directly (don't rely on stale state)
    if (!multiDayResult) return
    const day = multiDayResult.days.find((d) => d.day_index === dayIndex)
    if (!day) return

    const updatedPlaces = day.itinerary
      .map((s) => {
        const p = places.find((p) => p.name === s.name)
        if (!p) return null
        return s.name === name ? { ...p, duration: newDuration } : p
      })
      .filter(Boolean) as Place[]

    try {
      const result = await generateItinerary({
        places: updatedPlaces,
        day_start: dayStart,
        day_end: dayEnd,
        transport_mode: transportMode,
        locked_order: true,
      })
      setMultiDayResult((prev) =>
        prev && {
          ...prev,
          days: prev.days.map((d) =>
            d.day_index === dayIndex
              ? { ...d, itinerary: result.itinerary, conflicts: result.conflicts, stats: result.stats }
              : d,
          ),
        },
      )
    } catch {
      // Silent
    }
  }

  async function handleReschedule(dayIndex: number, reorderedSlots: ItinerarySlot[]) {
    const orderedPlaces = reorderedSlots
      .map((slot) => places.find((p) => p.name === slot.name))
      .filter(Boolean) as Place[]

    try {
      const result = await generateItinerary({
        places: orderedPlaces,
        day_start: dayStart,
        day_end: dayEnd,
        transport_mode: transportMode,
        locked_order: true,
      })
      setMultiDayResult((prev) =>
        prev && {
          ...prev,
          days: prev.days.map((d) =>
            d.day_index === dayIndex
              ? { ...d, itinerary: result.itinerary, conflicts: result.conflicts, stats: result.stats }
              : d,
          ),
        },
      )
    } catch {
      // Silent — optimistic update already applied
    }
  }

  async function handleRemoveStop(dayIndex: number, name: string) {
    if (!multiDayResult) return
    const day = multiDayResult.days.find((d) => d.day_index === dayIndex)
    if (!day) return

    const remainingPlaces = day.itinerary
      .filter((s) => s.name !== name)
      .map((s) => places.find((p) => p.name === s.name))
      .filter(Boolean) as Place[]

    try {
      const result = await generateItinerary({
        places: remainingPlaces,
        day_start: dayStart,
        day_end: dayEnd,
        transport_mode: transportMode,
      })
      setMultiDayResult((prev) =>
        prev && {
          ...prev,
          days: prev.days.map((d) =>
            d.day_index === dayIndex
              ? { ...d, itinerary: result.itinerary, conflicts: result.conflicts, stats: result.stats }
              : d,
          ),
        },
      )
    } catch {
      // Silent
    }
  }

  async function handleAddRecommendedPlace(place: Place) {
    // Append the recommended place, then re-run multi-day generation so it
    // lands on a sensible day with full scheduling/conflict logic applied.
    const updatedPlaces = places.some((p) => p.name === place.name)
      ? places
      : [...places, { ...place, selected: true }]
    setPlaces(updatedPlaces)

    if (!startDate || !endDate) return

    setLoading(true)
    setError(null)
    try {
      const result = await generateMultiDayItinerary({
        places: updatedPlaces,
        day_start: dayStart,
        day_end: dayEnd,
        transport_mode: transportMode,
        start_date: startDate,
        end_date: endDate,
        selected_names: updatedPlaces.filter((p) => p.selected !== false).map((p) => p.name),
      })
      setMultiDayResult(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add recommendation')
    } finally {
      setLoading(false)
    }
  }

  async function handleMoveToNextDay(fromDay: number, name: string) {
    if (!multiDayResult) return
    const srcDay = multiDayResult.days.find((d) => d.day_index === fromDay)
    const dstDay = multiDayResult.days.find((d) => d.day_index === fromDay + 1)
    if (!srcDay || !dstDay) return

    const movedPlace = places.find((p) => p.name === name)
    if (!movedPlace) return

    const srcPlaces = srcDay.itinerary
      .filter((s) => s.name !== name)
      .map((s) => places.find((p) => p.name === s.name))
      .filter(Boolean) as Place[]

    const dstPlaces = [
      ...dstDay.itinerary.map((s) => places.find((p) => p.name === s.name)).filter(Boolean) as Place[],
      movedPlace,
    ]

    try {
      const [srcResult, dstResult] = await Promise.all([
        generateItinerary({ places: srcPlaces, day_start: dayStart, day_end: dayEnd, transport_mode: transportMode }),
        generateItinerary({ places: dstPlaces, day_start: dayStart, day_end: dayEnd, transport_mode: transportMode }),
      ])
      setMultiDayResult((prev) =>
        prev && {
          ...prev,
          days: prev.days.map((d) => {
            if (d.day_index === fromDay) return { ...d, itinerary: srcResult.itinerary, conflicts: srcResult.conflicts, stats: srcResult.stats }
            if (d.day_index === fromDay + 1) return { ...d, itinerary: dstResult.itinerary, conflicts: dstResult.conflicts, stats: dstResult.stats }
            return d
          }),
        },
      )
    } catch {
      // Silent
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-indigo-600 tracking-tight">Pin</h1>
        <p className="text-sm text-gray-500 mt-0.5">Plan your trip, one place at a time</p>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-5 py-3">
            {error}
          </div>
        )}

        {stage === 'staging' && (
          <StagingView
            places={places}
            startDate={startDate}
            endDate={endDate}
            dayStart={dayStart}
            dayEnd={dayEnd}
            transportMode={transportMode}
            loading={loading}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onToggleSelect={handleToggleSelect}
            onToggleGroup={handleToggleGroup}
            onMealTypeChange={handleMealTypeChange}
            onDatesChange={handleDatesChange}
            onDayChange={handleDayChange}
            onCreateItinerary={handleCreateItinerary}
          />
        )}

        {stage === 'itinerary' && multiDayResult && (
          <ItineraryView
            result={multiDayResult}
            dayStart={dayStart}
            dayEnd={dayEnd}
            places={places}
            transportMode={transportMode}
            onReorder={handleReorder}
            onReschedule={handleReschedule}
            onDurationChange={handleDurationChange}
            onRemoveStop={handleRemoveStop}
            onMoveToNextDay={handleMoveToNextDay}
            onEditPlaces={() => setStage('staging')}
            onAddRecommendedPlace={handleAddRecommendedPlace}
          />
        )}
      </main>
    </div>
  )
}
