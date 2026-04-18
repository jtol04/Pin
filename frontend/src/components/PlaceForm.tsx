import { useState, useRef, useEffect } from 'react'
import { autocomplete, suggestPlace } from '../api/client'
import type { Place, PlaceSuggestion, AutocompleteResult, MealType } from '../types'

interface Props {
  onAdd: (place: Place) => void
}

const DEBOUNCE_MS = 300

export default function PlaceForm({ onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<AutocompleteResult[]>([])
  const [selected, setSelected] = useState<{ place_id: string; name: string } | null>(null)
  const [suggestion, setSuggestion] = useState<PlaceSuggestion | null>(null)
  const [duration, setDuration] = useState('')
  const [durationNote, setDurationNote] = useState('')
  const [fixedStart, setFixedStart] = useState('')
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    setSelected(null)
    setSuggestion(null)
    setDuration('')
    setDurationNote('')

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.length < 2) { setPredictions([]); setShowDropdown(false); return }

    debounceRef.current = setTimeout(async () => {
      const results = await autocomplete(val)
      setPredictions(results)
      setShowDropdown(results.length > 0)
    }, DEBOUNCE_MS)
  }

  async function handleSelect(prediction: AutocompleteResult) {
    setQuery(prediction.description)
    setSelected({ place_id: prediction.place_id, name: prediction.description })
    setPredictions([])
    setShowDropdown(false)
    setLoadingSuggest(true)

    try {
      const result = await suggestPlace(prediction.place_id, prediction.description)
      setSuggestion(result)
      setDuration(String(result.suggested_duration))
      setDurationNote(result.duration_note)
      // Overwrite query with canonical name from Places API
      setQuery(result.name)
      setSelected({ place_id: prediction.place_id, name: result.name })
    } catch {
      // Suggestion failed — leave duration blank for manual entry
    } finally {
      setLoadingSuggest(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim() || !duration) return

    const place: Place = {
      name: selected?.name ?? query.trim(),
      duration: parseFloat(duration),
      place_id: selected?.place_id,
      lat: suggestion?.lat,
      lng: suggestion?.lng,
      types: suggestion?.types ?? [],
      category: suggestion?.category,
      region: suggestion?.region,
      opening_hours: suggestion?.opening_hours,
      meal_type: suggestion?.meal_type as MealType | undefined,
      selected: true,
    }
    if (fixedStart !== '') place.fixed_start = parseFloat(fixedStart)

    onAdd(place)
    setQuery('')
    setDuration('')
    setDurationNote('')
    setFixedStart('')
    setSelected(null)
    setSuggestion(null)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Add a place</h2>

      <div className="flex flex-col sm:flex-row gap-3">
        {/* Autocomplete input */}
        <div className="relative flex-1" ref={wrapperRef}>
          <input
            type="text"
            placeholder="Search for a place…"
            value={query}
            onChange={handleQueryChange}
            onFocus={() => predictions.length > 0 && setShowDropdown(true)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {showDropdown && (
            <ul className="absolute z-10 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {predictions.map((p) => (
                <li
                  key={p.place_id}
                  onMouseDown={() => handleSelect(p)}
                  className="px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 cursor-pointer"
                >
                  {p.description}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Duration */}
        <div className="relative w-44">
          <input
            type="number"
            placeholder={loadingSuggest ? 'Suggesting…' : 'Duration (hrs)'}
            value={duration}
            onChange={(e) => { setDuration(e.target.value); setDurationNote('') }}
            min={0.5}
            step={0.5}
            required
            disabled={loadingSuggest}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>

        {/* Fixed time */}
        <input
          type="time"
          title="Fixed start time (optional)"
          value={fixedStart}
          onChange={(e) => setFixedStart(e.target.value)}
          className="w-36 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />

        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors whitespace-nowrap"
        >
          Add
        </button>
      </div>

      {/* AI duration note */}
      {durationNote && !loadingSuggest && (
        <p className="text-xs text-indigo-500 mt-2">{durationNote}</p>
      )}
      {loadingSuggest && (
        <p className="text-xs text-gray-400 mt-2">Getting duration estimate…</p>
      )}
      {!durationNote && !loadingSuggest && (
        <p className="text-xs text-gray-400 mt-2">
          Fixed time is optional — pin a stop to a specific hour
        </p>
      )}
    </form>
  )
}
