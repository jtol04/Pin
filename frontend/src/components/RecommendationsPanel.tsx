import { useEffect, useState } from 'react'
import { fetchRecommendations } from '../api/client'
import type { Place, Recommendation, MealType } from '../types'

interface Props {
  places: Place[]
  onAddPlace: (place: Place) => void
}

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽️',
  museum: '🏛️',
  park: '🌳',
  attraction: '🎡',
  shopping: '🛍️',
  lodging: '🏨',
}

export default function RecommendationsPanel({ places, onAddPlace }: Props) {
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(false)
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const regions = Array.from(new Set(places.map((p) => p.region || '').filter(Boolean)))
      const categories = Array.from(new Set(places.map((p) => p.category || '').filter(Boolean)))
      const existing = places.map((p) => p.place_id || '').filter(Boolean)
      try {
        const result = await fetchRecommendations(regions, categories, existing)
        if (!cancelled) setRecs(result.recommendations)
      } catch {
        if (!cancelled) setRecs([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [places])

  function handleAdd(rec: Recommendation) {
    onAddPlace({
      name: rec.place.name,
      duration: rec.place.suggested_duration,
      place_id: rec.place.place_id,
      lat: rec.place.lat,
      lng: rec.place.lng,
      types: rec.place.types,
      category: rec.place.category,
      region: rec.place.region,
      opening_hours: rec.place.opening_hours,
      meal_type: rec.place.meal_type as MealType | undefined,
      selected: true,
    })
    setAdded((prev) => new Set(prev).add(rec.place.place_id))
  }

  if (loading && recs.length === 0) return null
  if (recs.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-semibold text-gray-800">Recommended for you</h3>
        <span className="text-xs text-gray-400">Based on this trip</span>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Tailored picks from places near your stops, with sponsored placements from local businesses
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {recs.map((rec) => {
          const emoji = CATEGORY_EMOJI[rec.place.category] ?? '📍'
          const isAdded = added.has(rec.place.place_id)
          return (
            <div
              key={rec.place.place_id}
              className={`relative border rounded-xl p-4 flex flex-col gap-2 transition-colors ${
                rec.sponsored
                  ? 'border-amber-200 bg-amber-50/40'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              {rec.sponsored && (
                <span className="absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                  Sponsored
                </span>
              )}
              <div className="text-sm font-semibold text-gray-800 pr-12">
                {emoji} {rec.place.name}
              </div>
              <div className="text-xs text-gray-500">
                {rec.place.region || rec.place.address} · {rec.place.suggested_duration}h
              </div>
              {rec.tagline && (
                <p className="text-xs text-gray-600 italic">{rec.tagline}</p>
              )}
              {rec.sponsor_label && (
                <p className="text-[11px] text-amber-700 font-medium">{rec.sponsor_label}</p>
              )}
              <button
                onClick={() => handleAdd(rec)}
                disabled={isAdded}
                className={`mt-auto text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
                  isAdded
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {isAdded ? 'Added to trip' : 'Add to trip'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
