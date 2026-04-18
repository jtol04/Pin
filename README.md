# Pin

A travel itinerary planner that turns a list of places into an optimized day schedule.

## Running the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Runs on **http://localhost:8000**. Interactive docs at http://localhost:8000/docs.

## Running the frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on **http://localhost:5173**. API requests to `/itinerary/*` are proxied to the backend.

## Project structure

```
Pin/
  backend/
    main.py            # FastAPI app + CORS
    models.py          # Pydantic models
    scheduler.py       # Core scheduling algorithm
    routers/
      itinerary.py     # POST /itinerary/generate and /itinerary/remove
    requirements.txt
  frontend/
    src/
      components/
        PlaceForm.tsx       # Add-a-place form
        PlaceList.tsx       # Cards for current places
        Timeline.tsx        # Horizontal visual timeline
        ConflictBanner.tsx  # Amber warning banner
      api/client.ts         # fetch wrappers
      types/index.ts        # TypeScript interfaces
      App.tsx
      main.tsx
```

## Notes

- All state lives in the React frontend — no database.
- Travel time is a flat 20 minutes between every stop (see `scheduler.py` `TRAVEL_TIME` constant — swap in a real routing API call there).
- Flexible places are scheduled first; pinned places (fixed_start) are anchored at their specified time.
