from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.models import Health, ScenarioRequest, ScenarioSet
from engine import scenarios
from sim.generator import customers_by_id

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


@app.post("/scenarios", response_model=ScenarioSet)
def run_scenarios(req: ScenarioRequest) -> ScenarioSet:
    customer = customers_by_id().get(req.customer_id)
    if customer is None:
        raise HTTPException(404, f"Unknown customer {req.customer_id}")
    o = req.overrides
    if o and ((o.term_months is not None and o.term_months <= 0) or (o.apr is not None and o.apr < 0)
              or (o.down_payment is not None and o.down_payment < 0) or (o.annual_miles is not None and o.annual_miles < 0)):
        raise HTTPException(422, "Overrides must be non-negative and term_months positive")
    return scenarios.run(req, customer)
