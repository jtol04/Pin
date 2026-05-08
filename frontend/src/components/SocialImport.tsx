import { useState } from 'react'
import { importSocial } from '../api/client'
import type { Place, PlaceSuggestion } from '../types'

interface Props {
  onAdd: (place: Place) => void
}

export default function SocialImport({ onAdd }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const [source, setSource] = useState('')
  const [error, setError] = useState('')

  async function runImport(target: string) {
    if (!target.trim()) return
    setLoading(true)
    setError('')
    setResults([])
    try {
      const data = await importSocial(target.trim())
      setResults(data.places)
      setSource(data.source)
      if (data.places.length === 0) {
        setError('No places found in this link. Try a different post.')
      }
    } catch {
      setError('Failed to import. Check the URL and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    await runImport(url)
  }

  function handleAddPlace(p: PlaceSuggestion) {
    onAdd({
      name: p.name,
      duration: p.suggested_duration,
      place_id: p.place_id,
      lat: p.lat,
      lng: p.lng,
      types: p.types,
      category: p.category,
      region: p.region,
      opening_hours: p.opening_hours,
      meal_type: p.meal_type,
      selected: true,
    })
    setResults((prev) => prev.filter((r) => r.place_id !== p.place_id))
  }

  function handleAddAll() {
    for (const p of results) handleAddPlace(p)
  }

  const DEMO_LINKS = [
    { label: 'Tokyo ramen (Instagram)', url: 'https://www.instagram.com/p/DH7sa2tuvWw/?img_index=1&igsh=dGw1aXc1YjFtNGZh' },
    { label: 'NYC food crawl (Instagram)', url: 'https://instagram.com/p/nyc-foodie' },
    { label: 'Tokyo highlights (TikTok)', url: 'https://tiktok.com/@traveler/tokyo' },
    { label: 'Paris weekend (Reddit)', url: 'https://reddit.com/r/travel/paris' },
  ]

  async function tryDemo(demoUrl: string) {
    setUrl(demoUrl)
    await runImport(demoUrl)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Import from social media</h2>
      <p className="text-xs text-gray-400 mb-4">
        Paste a link from Instagram, TikTok, or Reddit to extract places
      </p>

      <form onSubmit={handleImport} className="flex gap-3">
        <input
          type="url"
          placeholder="https://www.instagram.com/p/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors whitespace-nowrap disabled:bg-gray-300"
        >
          {loading ? 'Extracting…' : 'Import'}
        </button>
      </form>

      {/* Quick demo URLs */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">
          Try demo
        </span>
        {DEMO_LINKS.map((d) => (
          <button
            key={d.url}
            type="button"
            onClick={() => tryDemo(d.url)}
            className="text-xs font-medium px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
          >
            {d.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

      {results.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Found {results.length} place{results.length !== 1 ? 's' : ''}
              {source && source !== 'other' ? ` from ${source}` : ''}
            </p>
            <button
              onClick={handleAddAll}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Add all
            </button>
          </div>
          {results.map((p) => (
            <div
              key={p.place_id}
              className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">{p.name}</p>
                <p className="text-xs text-gray-500">
                  {p.address} · {p.suggested_duration}h · {p.duration_note}
                </p>
              </div>
              <button
                onClick={() => handleAddPlace(p)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
              >
                Add
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
