from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.itinerary import router as itinerary_router
from routers.places import router as places_router
from routers.trips import router as trips_router

app = FastAPI(title="Pin API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(itinerary_router)
app.include_router(places_router)
app.include_router(trips_router)
