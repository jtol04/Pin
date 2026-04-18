import { useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ItinerarySlot, Place, PlaceCategory, TransportMode } from '../types'

// ── Time formatter ─────────────────────────────────────────────────────────

function fmt(h: number): string {
  const total = Math.round(h * 60)
  const hour = Math.floor(total / 60)
  const minute = total % 60
  const period = hour < 12 ? 'am' : 'pm'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${String(minute).padStart(2, '0')}${period}`
}

function fmtDuration(h: number): string {
  const min = Math.round(h * 60)
  if (min < 60) return `${min} min`
  const hrs = min / 60
  return `${Number.isInteger(hrs) ? hrs : hrs.toFixed(1)} hr${hrs !== 1 ? 's' : ''}`
}

// ── Category colors ────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<PlaceCategory | 'default', string> = {
  food:       'bg-orange-400',
  museum:     'bg-purple-500',
  park:       'bg-green-500',
  attraction: 'bg-indigo-500',
  shopping:   'bg-yellow-500',
  lodging:    'bg-sky-500',
  other:      'bg-gray-400',
  default:    'bg-indigo-500',
}

const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  food: 'Food', museum: 'Museum', park: 'Park',
  attraction: 'Attraction', shopping: 'Shopping', lodging: 'Lodging', other: 'Other',
}

const MEAL_ICON: Record<string, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
}

function dotColor(category?: string): string {
  return CATEGORY_COLOR[(category as PlaceCategory) ?? 'default'] ?? CATEGORY_COLOR.default
}

// ── Inline duration editor ─────────────────────────────────────────────────

interface DurationEditorProps {
  durationHours: number
  onSave: (newDuration: number) => void
}

function DurationEditor({ durationHours, onSave }: DurationEditorProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(durationHours))

  function commit() {
    const parsed = parseFloat(value)
    if (!isNaN(parsed) && parsed >= 0.25) {
      // Round to nearest 15 min
      const rounded = Math.round(parsed * 4) / 4
      onSave(rounded)
    }
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <input
          type="number"
          min={0.25}
          step={0.25}
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-16 text-xs border border-indigo-300 rounded px-1 py-0.5 text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <span className="text-xs text-gray-400">hrs</span>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); setValue(String(durationHours)); setEditing(true) }}
      className="text-xs text-gray-500 hover:text-indigo-600 hover:underline underline-offset-2 transition-colors cursor-pointer"
      title="Click to edit duration"
    >
      {fmtDuration(durationHours)}
    </button>
  )
}

// ── Sortable stop card ─────────────────────────────────────────────────────

interface StopCardProps {
  slot: ItinerarySlot
  mealType?: string
  isGhost?: boolean
  onDurationChange?: (name: string, duration: number) => void
}

function StopCard({ slot, mealType, isGhost = false, onDurationChange }: StopCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slot.name })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  const durationHours = slot.end - slot.start
  const cat = slot.category as PlaceCategory | undefined
  const catLabel = cat ? CATEGORY_LABEL[cat] : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex gap-3 ${isGhost ? 'opacity-90' : ''}`}
    >
      {/* Time column */}
      <div className="w-14 flex-shrink-0 text-right">
        <span className="text-xs text-gray-500 font-medium leading-none">{fmt(slot.start)}</span>
      </div>

      {/* Card */}
      <div
        className={`flex-1 border rounded-xl px-4 py-3 shadow-sm transition-colors ${
          isGhost
            ? 'bg-indigo-50 border-indigo-200 shadow-md'
            : slot.pinned
            ? 'bg-teal-50 border-teal-200'
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}
      >
        <div className="flex items-start gap-2">
          {/* Drag handle */}
          {!isGhost && (
            <span
              {...attributes}
              {...listeners}
              className="text-gray-300 hover:text-gray-400 cursor-grab active:cursor-grabbing select-none text-sm mt-0.5 flex-shrink-0"
              aria-label="Drag to reorder"
            >
              ⣿
            </span>
          )}

          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${dotColor(slot.category)}`} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-800 truncate">{slot.name}</span>
              {catLabel && <span className="text-xs text-gray-500">{catLabel}</span>}
              {mealType && <span className="text-xs">{MEAL_ICON[mealType]}</span>}
              {slot.pinned && <span className="text-xs text-teal-600 font-medium">pinned</span>}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {fmt(slot.start)} – {fmt(slot.end)}
              {' · '}
              {onDurationChange && !isGhost ? (
                <DurationEditor
                  durationHours={durationHours}
                  onSave={d => onDurationChange(slot.name, d)}
                />
              ) : (
                fmtDuration(durationHours)
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Travel row ─────────────────────────────────────────────────────────────

function TravelRow({ minutes }: { minutes: number }) {
  return (
    <div className="flex gap-3 items-center py-1">
      <div className="w-14 flex-shrink-0" />
      <div className="flex-1 flex items-center gap-2 text-xs text-gray-400">
        <div className="flex-1 border-t border-dashed border-gray-200" />
        <span className="flex-shrink-0">{minutes} min travel</span>
        <div className="flex-1 border-t border-dashed border-gray-200" />
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  dayIndex: number
  slots: ItinerarySlot[]
  dayLabel?: string
  places: Place[]
  transportMode: TransportMode
  onReorder: (dayIndex: number, newSlots: ItinerarySlot[]) => void
  onReschedule: (dayIndex: number, reorderedSlots: ItinerarySlot[]) => Promise<void>
  onDurationChange: (dayIndex: number, name: string, duration: number) => void
}

export default function ScheduleView({
  dayIndex,
  slots,
  dayLabel,
  places,
  onReorder,
  onReschedule,
  onDurationChange,
}: Props) {
  const [activeSlot, setActiveSlot] = useState<ItinerarySlot | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  function mealTypeFor(slotName: string): string | undefined {
    return places.find(p => p.name === slotName)?.meal_type
  }

  function handleDragStart(event: DragStartEvent) {
    const slot = slots.find(s => s.name === event.active.id)
    setActiveSlot(slot ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveSlot(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = slots.findIndex(s => s.name === active.id)
    const newIndex = slots.findIndex(s => s.name === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(slots, oldIndex, newIndex)
    onReorder(dayIndex, reordered)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onReschedule(dayIndex, reordered)
    }, 600)
  }

  if (slots.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{dayLabel ?? 'Itinerary'}</h2>
        <p className="text-sm text-gray-400">Add places above to see your day plotted here.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      {dayLabel && (
        <h2 className="text-base font-semibold text-gray-800 mb-4">{dayLabel}</h2>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={slots.map(s => s.name)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0">
            {slots.map((slot, i) => (
              <div key={slot.name}>
                {i > 0 && slot.travel_minutes > 0 && (
                  <TravelRow minutes={slot.travel_minutes} />
                )}
                <StopCard
                  slot={slot}
                  mealType={mealTypeFor(slot.name)}
                  onDurationChange={(name, d) => onDurationChange(dayIndex, name, d)}
                />
              </div>
            ))}
            {slots.length > 0 && (
              <div className="flex gap-3 pt-1">
                <div className="w-14 flex-shrink-0 text-right">
                  <span className="text-xs text-gray-400">{fmt(slots[slots.length - 1].end)}</span>
                </div>
                <div className="flex-1" />
              </div>
            )}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeSlot && (
            <StopCard
              slot={activeSlot}
              mealType={mealTypeFor(activeSlot.name)}
              isGhost
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
