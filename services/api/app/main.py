from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models import Health

app = FastAPI(title="Toyota NextMove API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=Health)
def health() -> Health:
    return Health(status="ok", version=app.version)
