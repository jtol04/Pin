import type { ItinerarySlot, Place, TransportMode } from '../types'
import ScheduleView from './ScheduleView'

interface Props {
  itinerary: ItinerarySlot[]
  dayStart?: number
  dayEnd?: number
  dayLabel?: string
  dayIndex?: number
  places: Place[]
  transportMode: TransportMode
  onReorder: (dayIndex: number, newSlots: ItinerarySlot[]) => void
  onReschedule: (dayIndex: number, reorderedSlots: ItinerarySlot[]) => Promise<void>
  onDurationChange: (dayIndex: number, name: string, duration: number) => void
}

export default function Timeline({
  itinerary,
  dayLabel,
  dayIndex = 0,
  places,
  transportMode,
  onReorder,
  onReschedule,
  onDurationChange,
}: Props) {
  return (
    <ScheduleView
      dayIndex={dayIndex}
      slots={itinerary}
      dayLabel={dayLabel}
      places={places}
      transportMode={transportMode}
      onReorder={onReorder}
      onReschedule={onReschedule}
      onDurationChange={onDurationChange}
    />
  )
}
