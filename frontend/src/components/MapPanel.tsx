import { useEffect, useRef, useState } from 'react'
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import type { Place, DayItinerary, PlaceCategory } from '../types'

// ── Category colors ────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<PlaceCategory | 'default', string> = {
  food:       '#f97316',
  museum:     '#a855f7',
  park:       '#22c55e',
  attraction: '#6366f1',
  shopping:   '#eab308',
  lodging:    '#0ea5e9',
  other:      '#6b7280',
  default:    '#6366f1',
}

function markerColor(category?: string): string {
  return CATEGORY_COLOR[(category as PlaceCategory) ?? 'default'] ?? CATEGORY_COLOR.default
}

// ── Route polyline ─────────────────────────────────────────────────────────

interface RoutePolylineProps {
  path: Array<{ lat: number; lng: number }>
}

function RoutePolyline({ path }: RoutePolylineProps) {
  const map = useMap()
  const mapsLib = useMapsLibrary('maps')
  const polylineRef = useRef<google.maps.Polyline | null>(null)

  useEffect(() => {
    if (!map || !mapsLib || path.length < 2) return
    if (polylineRef.current) polylineRef.current.setMap(null)
    polylineRef.current = new mapsLib.Polyline({
      path,
      strokeColor: '#6366f1',
      strokeWeight: 3,
      strokeOpacity: 0.75,
      map,
    })
    return () => { polylineRef.current?.setMap(null) }
  }, [map, mapsLib, path])

  return null
}

// ── Stop pill marker (itinerary mode) ─────────────────────────────────────

function fmtTime(h: number): string {
  const total = Math.round(h * 60)
  const hour = Math.floor(total / 60)
  const minute = total % 60
  const period = hour < 12 ? 'am' : 'pm'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${String(minute).padStart(2, '0')}${period}`
}

function StopMarker({
  index, category, name, startTime, endTime,
}: {
  index: number
  category?: string
  name: string
  startTime: number
  endTime: number
}) {
  const [expanded, setExpanded] = useState(false)
  const color = markerColor(category)
  const durationMin = Math.round((endTime - startTime) * 60)

  return (
    <div
      onClick={() => setExpanded((v) => !v)}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      {expanded ? (
        // Expanded card
        <div
          style={{
            background: 'white',
            borderRadius: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            padding: '8px 12px',
            maxWidth: 200,
            border: `2px solid ${color}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div
              style={{
                background: color,
                width: 20, height: 20, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}
            >
              {index}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1f2937' }}>{name}</span>
          </div>
          <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>
            {fmtTime(startTime)} – {fmtTime(endTime)} · {durationMin} min
          </p>
        </div>
      ) : (
        // Compact pill
        <div
          style={{
            background: 'white',
            borderRadius: 20,
            boxShadow: '0 1px 5px rgba(0,0,0,0.2)',
            padding: '4px 10px 4px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: 180,
            border: '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <div
            style={{
              background: color,
              width: 20, height: 20, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 10, fontWeight: 700, flexShrink: 0,
            }}
          >
            {index}
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name.length > 14 ? name.slice(0, 13) + '…' : name}
          </span>
          <span style={{ fontSize: 10, color: '#6b7280', flexShrink: 0 }}>{fmtTime(startTime)}</span>
        </div>
      )}
    </div>
  )
}

// ── Plain pin marker (staging mode) ────────────────────────────────────────

function PinMarker({ label, category }: { label: string; category?: string }) {
  const color = markerColor(category)
  const short = label.length > 12 ? label.slice(0, 11) + '…' : label
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div
        title={label}
        style={{
          background: color,
          width: 20, height: 20, borderRadius: '50%',
          border: '2px solid white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          cursor: 'default',
        }}
      />
      <div
        style={{
          background: 'rgba(30,30,30,0.75)',
          color: 'white',
          fontSize: 10,
          padding: '1px 5px',
          borderRadius: 8,
          whiteSpace: 'nowrap',
          maxWidth: 100,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {short}
      </div>
    </div>
  )
}

// ── Centroid helper ────────────────────────────────────────────────────────

function centroid(coords: Array<{ lat: number; lng: number }>): { lat: number; lng: number } | null {
  const valid = coords.filter((c) => c.lat !== 0 || c.lng !== 0)
  if (valid.length === 0) return null
  return {
    lat: valid.reduce((s, c) => s + c.lat, 0) / valid.length,
    lng: valid.reduce((s, c) => s + c.lng, 0) / valid.length,
  }
}

// ── Map inner content ──────────────────────────────────────────────────────

interface MapContentProps {
  mode: 'staging' | 'itinerary'
  places?: Place[]
  days?: DayItinerary[]
  activeDayIndex?: number
}

function MapContent({ mode, places, days, activeDayIndex = 0 }: MapContentProps) {
  if (mode === 'staging') {
    const pins = (places ?? []).filter((p) => p.lat && p.lng)
    const center = centroid(pins.map((p) => ({ lat: p.lat!, lng: p.lng! })))

    return (
      <Map
        defaultCenter={center ?? { lat: 35.6762, lng: 139.6503 }}
        defaultZoom={center ? 12 : 2}
        mapId="pin-staging-map"
        style={{ width: '100%', height: '100%' }}
        gestureHandling="greedy"
        disableDefaultUI={false}
      >
        {pins.map((place) => (
          <AdvancedMarker key={place.name} position={{ lat: place.lat!, lng: place.lng! }}>
            <PinMarker label={place.name} category={place.category} />
          </AdvancedMarker>
        ))}
      </Map>
    )
  }

  // Itinerary mode
  const activeDay = (days ?? []).find((d) => d.day_index === activeDayIndex) ?? days?.[0]
  if (!activeDay) return null

  const slots = activeDay.itinerary.filter((s) => s.lat && s.lng)
  const center = centroid(slots.map((s) => ({ lat: s.lat!, lng: s.lng! })))
  const routePath = slots.map((s) => ({ lat: s.lat!, lng: s.lng! }))

  return (
    <Map
      defaultCenter={center ?? { lat: 35.6762, lng: 139.6503 }}
      defaultZoom={center ? 13 : 2}
      key={`day-${activeDayIndex}`}
      mapId="pin-itinerary-map"
      style={{ width: '100%', height: '100%' }}
      gestureHandling="greedy"
      disableDefaultUI={false}
    >
      {slots.map((slot, i) => (
        <AdvancedMarker key={slot.name} position={{ lat: slot.lat!, lng: slot.lng! }}>
          <StopMarker
            index={i + 1}
            category={slot.category}
            name={slot.name}
            startTime={slot.start}
            endTime={slot.end}
          />
        </AdvancedMarker>
      ))}
      {routePath.length >= 2 && <RoutePolyline path={routePath} />}
    </Map>
  )
}

// ── Public component ───────────────────────────────────────────────────────

interface Props {
  mode: 'staging' | 'itinerary'
  places?: Place[]
  days?: DayItinerary[]
  activeDayIndex?: number
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined

export default function MapPanel({ mode, places, days, activeDayIndex }: Props) {
  if (!API_KEY) {
    return (
      <div className="bg-gray-100 rounded-xl flex items-center justify-center text-sm text-gray-400 h-full min-h-[300px]">
        Add <code className="mx-1 bg-gray-200 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> to enable map
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm h-full min-h-[300px]">
      <APIProvider apiKey={API_KEY}>
        <MapContent mode={mode} places={places} days={days} activeDayIndex={activeDayIndex} />
      </APIProvider>
    </div>
  )
}
