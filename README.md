# Pin

A travel itinerary planner that turns a list of places into a researched, time-and-distance-aware day schedule. Pin sits in the gap between Google Maps (which only handles space) and Google Calendar (which only handles time), grounded in the workflow described in Bilbily et al., *Space, Time, and Choice: A Unified Approach to Flexible Personal Scheduling* (UIST '21).

## Features

- **Research-backed scheduler** — solves a TSP-with-time-windows so trip stops are ordered for minimum travel while respecting fixed reservations, meal windows, and venue opening hours.
- **Live travel times** — Google Distance Matrix (with `departure_time=now` for traffic-aware driving times); Haversine fallback per pair when a place has no Google ID.
- **Opening-hours awareness** — venues closed on the trip date are filtered with a conflict notice; the scheduler shifts stops to fit each venue's open window.
- **Adaptive replanning** — drop, reorder, or change a stop's duration and the entire schedule recomputes (travel times, conflicts, free hours) in real time.
- **Social-media import** — paste an Instagram / TikTok / Reddit link and Pin extracts the named places (canned demo URLs short-circuit Maps so the flow works without a key; real URLs use the Anthropic API + Google Places). The paste-a-link UI is the proof-of-concept stand-in for what would ship as a native share-sheet action ("Share to Pin").
- **Group trip coordination** — any trip turns into a unique share link (`/trip/<id>`). The shared view is multi-day, fully editable by collaborators (add a place, ✕ to remove a stop), and shows a clear shared-trip banner with one-click copy. Every edit syncs back through the trips API. Backed by Supabase when configured, with an in-memory fallback for local development.
- **Tailored recommendations** — region-aware sponsored + organic picks appear on the itinerary view; one tap adds them to the trip and re-runs the scheduler. Sponsors are matched by city, neighborhood, and open meal slot.
- **Multi-demo selector** — five pre-built demo trips on the staging screen for screenshot-friendly walkthroughs: NYC Classic, Family Vacation, Solo First-Time Traveler, Local Business Advertiser (NYC), Local Business Advertiser (Tokyo).

## Running the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Runs on **http://localhost:8000**. Interactive docs at http://localhost:8000/docs.

### Environment

Create `backend/.env` with the keys you have available — every service degrades gracefully when a key is missing:

```env
GOOGLE_MAPS_API_KEY=...    # enables real travel times + place autocomplete + opening hours
ANTHROPIC_API_KEY=...      # enables non-demo social media URL extraction + LLM duration estimates
SUPABASE_URL=...           # enables persistent shared trips
SUPABASE_ANON_KEY=...
```

Without any keys, demo URLs and the in-memory share-link store still work end-to-end.

## Running the frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on **http://localhost:5173**. API requests to `/itinerary/*`, `/places/*`, and `/trips/*` are proxied to the backend on port 8000.

Optional `frontend/.env`:

```env
VITE_GOOGLE_MAPS_API_KEY=...   # enables the embedded map view
```

## Demo flow

1. Open http://localhost:5173.
2. From the **Trip details** card, click **Load demo trip ▾** and pick one of the pre-built scenarios:
   - **NYC Classic** — 3-day NYC tour with 8 must-see spots
   - **Family Vacation** — Met museum tour fixed at 10am, Katz's dinner fixed at 7pm, kids' picks fill the gaps (showcases fixed times + meal windows)
   - **Solo First-Time Traveler** — Joe's Pizza, Los Tacos, and Levain Bakery imported from Instagram + headline NYC sights (showcases social import + recommendations)
   - **Local Business Advertiser (NYC)** — anchored on a Lower East Side stop so Katz's Delicatessen surfaces in *Recommended for you* with a Sponsored badge
   - **Local Business Advertiser (Tokyo)** — anchored on Shibuya so Tsukemen Daikoku surfaces as a sponsored placement
3. Or paste a social-import demo URL into the **Import from social media** section:
   - `https://www.instagram.com/p/DH7sa2tuvWw/?img_index=1&igsh=dGw1aXc1YjFtNGZh` → Tokyo ramen crawl
   - `https://instagram.com/p/nyc-foodie` → NYC food crawl
   - `https://tiktok.com/@traveler/tokyo` → Tokyo highlights
   - `https://reddit.com/r/travel/paris` → Paris weekend
4. Click **Create itinerary** to generate the multi-day plan.
5. On the itinerary view: drag stops to reorder, slide durations, remove stops, or use the **Recommended for you** panel to add sponsored / organic picks.
6. Click **Share trip** to get a `/trip/<id>` link. Open it in another tab to see the collaborator view (multi-day, editable, with a *"This is a shared trip"* banner).

## Project structure

```
Pin/
  backend/
    main.py                   # FastAPI app + CORS
    models.py                 # Pydantic models (Place, ItinerarySlot, ScheduleResult, ...)
    scheduler.py              # TSPTW solver + time-window walker + conflict logging
    config.py                 # .env loader
    routers/
      itinerary.py            # /itinerary/generate, /itinerary/generate-multiday, /itinerary/remove
      places.py               # /places/autocomplete, /places/suggest, /places/import-social, /places/recommendations
      trips.py                # /trips (POST/GET/PUT) — share link backend
    services/
      maps.py                 # Google Distance Matrix + Place Details + Haversine fallback
      ai.py                   # LLM-backed duration estimates (Anthropic API)
      categories.py           # types -> category, meal-type heuristics
      clustering.py           # Multi-day geographic bucketing
      food_crawl.py           # Same-day food-crawl detection
      db.py                   # Supabase wrapper with in-memory fallback
  frontend/
    src/
      components/
        StagingView.tsx           # Trip setup screen (places + settings)
        ItineraryView.tsx         # Generated schedule with recommendations panel
        SharedTripView.tsx        # Read-only view at /trip/<id>
        SocialImport.tsx          # Paste-a-URL importer with quick-demo pills
        RecommendationsPanel.tsx  # Sponsored + organic recommendations
        PlaceForm.tsx             # Search + autocomplete add-place form
        DayPanel.tsx              # Per-day schedule editor
        DraggableStopList.tsx     # Drag-to-reorder stops
        MapPanel.tsx              # Google Map with stop markers + route
        TripShare.tsx             # Share-link copy bar
        TripSettings.tsx          # Day-window + transport mode pickers
      api/client.ts               # fetch wrappers
      types/index.ts              # TypeScript interfaces
      App.tsx
      main.tsx
```

## How the scheduler works

The scheduler walks the user's places with a single time cursor that tracks the time of day. For each stop it adds travel time, jumps to a fixed start if the stop is locked, places the stop for its duration, and advances. Late arrivals to fixed events and stops that run past day-end are logged as conflicts but never crash the schedule. Adaptive replanning is the same function re-run with one stop dropped.

Conceptually:

```
clock = day_start
for each place in optimized_order:
    clock += travel_minutes(prev, place)
    if place.fixed_start:
        if clock > place.fixed_start: log "late"
        clock = place.fixed_start
    if place is closed today: filter, log "closed"
    if clock < place.opens_today: clock = place.opens_today
    schedule(place, start=clock, end=clock + duration)
    clock += duration
    if clock > day_end: log "past day end"
```

In production the visit order comes from an OR-Tools TSPTW solver that minimizes travel while respecting every place's time window (fixed reservations, meal windows, opening hours). The cursor walk above is the deterministic placement step that runs after the solver picks an order.

## License

This project is part of an academic course deliverable — please contact the authors before reuse.
