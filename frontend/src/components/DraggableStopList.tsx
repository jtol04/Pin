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
import type { ItinerarySlot } from '../types'

// ── Local storage hint key ─────────────────────────────────────────────────
const HINT_KEY = 'pin_drag_hint_seen'

// ── Time formatter ─────────────────────────────────────────────────────────
function fmt(h: number): string {
  const total = Math.round(h * 60)
  const hour = Math.floor(total / 60)
  const minute = total % 60
  const period = hour < 12 ? 'am' : 'pm'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${String(minute).padStart(2, '0')}${period}`
}

// ── Single sortable stop row ───────────────────────────────────────────────

interface StopRowProps {
  slot: ItinerarySlot
  isDragging?: boolean
}

function StopRow({ slot, isDragging = false }: StopRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortDragging } =
    useSortable({ id: slot.name })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortDragging ? 0.35 : 1,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 text-sm py-2 px-3 rounded-lg ${
        isDragging ? 'bg-indigo-50 shadow-md' : 'hover:bg-gray-50'
      } group transition-colors`}
    >
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        className="text-gray-300 group-hover:text-gray-400 cursor-grab active:cursor-grabbing select-none flex-shrink-0 text-base leading-none"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        ⣿
      </span>

      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${slot.pinned ? 'bg-teal-400' : 'bg-violet-500'}`}
      />
      <span className="font-medium text-gray-800 flex-1 truncate">{slot.name}</span>
      <span className="text-gray-500 whitespace-nowrap">{fmt(slot.start)} – {fmt(slot.end)}</span>
      {slot.travel_minutes > 0 && (
        <span className="text-xs text-gray-400 whitespace-nowrap">{slot.travel_minutes}min travel</span>
      )}
      {slot.pinned && <span className="text-xs text-teal-600 font-medium">pinned</span>}
    </li>
  )
}

// ── Drag overlay ghost ─────────────────────────────────────────────────────

function DragGhost({ slot }: { slot: ItinerarySlot }) {
  return (
    <li className="flex items-center gap-3 text-sm py-2 px-3 rounded-lg bg-white shadow-lg border border-indigo-200 opacity-90 list-none">
      <span className="text-gray-300 text-base leading-none">⣿</span>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${slot.pinned ? 'bg-teal-400' : 'bg-violet-500'}`} />
      <span className="font-medium text-gray-800 truncate">{slot.name}</span>
      <span className="text-gray-500 whitespace-nowrap">{fmt(slot.start)} – {fmt(slot.end)}</span>
    </li>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  dayIndex: number
  slots: ItinerarySlot[]
  onReorder: (dayIndex: number, newSlots: ItinerarySlot[]) => void
}

export default function DraggableStopList({ dayIndex, slots, onReorder }: Props) {
  const [activeSlot, setActiveSlot] = useState<ItinerarySlot | null>(null)
  const [hintDismissed, setHintDismissed] = useState(() =>
    typeof localStorage !== 'undefined' && localStorage.getItem(HINT_KEY) === '1',
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  function handleDragStart(event: DragStartEvent) {
    const slot = slots.find((s) => s.name === event.active.id)
    setActiveSlot(slot ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveSlot(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = slots.findIndex((s) => s.name === active.id)
    const newIndex = slots.findIndex((s) => s.name === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(slots, oldIndex, newIndex)
    onReorder(dayIndex, reordered)

    // Debounce re-schedule call (handled in App.tsx via onReorder)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    // TODO Phase 5 follow-up: call /itinerary/generate with locked_order: true
    // to recompute exact times after drag
  }

  function dismissHint() {
    setHintDismissed(true)
    localStorage.setItem(HINT_KEY, '1')
  }

  if (slots.length === 0) return null

  return (
    <div>
      {/* First-time drag hint */}
      {!hintDismissed && (
        <div className="flex items-center justify-between text-xs text-indigo-500 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-2">
          <span>Drag the ⣿ handle to reorder stops</span>
          <button onClick={dismissHint} className="ml-2 text-indigo-400 hover:text-indigo-600">
            &times;
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={slots.map((s) => s.name)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-0.5">
            {slots.map((slot) => (
              <StopRow key={slot.name} slot={slot} />
            ))}
          </ol>
        </SortableContext>

        <DragOverlay>
          {activeSlot && <DragGhost slot={activeSlot} />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
