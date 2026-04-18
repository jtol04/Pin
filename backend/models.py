from __future__ import annotations
from typing import Optional
from pydantic import BaseModel


class Place(BaseModel):
    name: str
    duration: float                   # hours
    fixed_start: Optional[float] = None  # decimal hours e.g. 19.0 = 7pm
    place_id: Optional[str] = None    # Google Maps place_id
    lat: Optional[float] = None
    lng: Optional[float] = None
    types: list[str] = []             # raw Google Places types
    category: Optional[str] = None   # "food"|"attraction"|"museum"|"park"|"shopping"|"lodging"|"other"
    region: Optional[str] = None     # city-level, e.g. "Tokyo" — used for grouping
    selected: bool = True            # whether included in next generation
    day_index: Optional[int] = None  # set by multi-day splitter; None = unassigned
    opening_hours: Optional[list] = None  # 7-element list indexed by weekday (0=Sun…6=Sat)
    meal_type: Optional[str] = None  # "breakfast" | "lunch" | "dinner" | None


class PlaceSuggestion(BaseModel):
    name: str
    place_id: str
    address: str
    lat: float
    lng: float
    suggested_duration: float        # hours
    duration_note: str               # e.g. "Most visitors spend 2–3 hours"
    types: list[str] = []
    category: str = "other"
    region: str = ""
    opening_hours: Optional[list] = None
    meal_type: Optional[str] = None


class ItinerarySlot(BaseModel):
    name: str
    start: float                     # decimal hours
    end: float
    pinned: bool
    travel_minutes: int = 0          # actual travel time from previous stop
    place_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    category: Optional[str] = None


class ScheduleResult(BaseModel):
    itinerary: list[ItinerarySlot]
    conflicts: list[str]
    stats: dict


class ScheduleRequest(BaseModel):
    places: list[Place]
    day_start: float = 9.0
    day_end: float = 21.0
    transport_mode: str = "driving"  # "driving" | "walking" | "bicycling" | "transit"
    locked_order: bool = False       # if True, skip TSPTW solver and use input order


class DayItinerary(BaseModel):
    day_index: int
    date: Optional[str] = None       # ISO date string e.g. "2026-04-14"
    itinerary: list[ItinerarySlot]
    conflicts: list[str]
    stats: dict
    weather: Optional[dict] = None   # hook for future weather API


class FoodCrawlSuggestion(BaseModel):
    places: list[str]                # place names
    day_index: int
    reason: str                      # human-readable e.g. "3 food spots within 20min"


class MultiDayScheduleResult(BaseModel):
    days: list[DayItinerary]
    food_crawl_suggestions: list[FoodCrawlSuggestion] = []
    total_stats: dict


class MultiDayScheduleRequest(BaseModel):
    places: list[Place]
    day_start: float = 9.0
    day_end: float = 21.0
    transport_mode: str = "driving"
    start_date: str                  # ISO date e.g. "2026-04-14" — required
    end_date: str                    # ISO date e.g. "2026-04-16"
    selected_names: list[str] = []   # empty = all places included


class Trip(BaseModel):
    id: str
    places: list[Place]
    day_start: float = 9.0
    day_end: float = 21.0
    transport_mode: str = "driving"
    itinerary: Optional[ScheduleResult] = None
