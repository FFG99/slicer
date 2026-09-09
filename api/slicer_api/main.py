from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Counter, Histogram, make_asgi_app

from slicer_api.config import settings
from slicer_api.routes.bifurcation import router as bifurcation_router
from slicer_api.routes.phase_portrait import router as phase_portrait_router
from slicer_api.routes.registry import router as registry_router
from slicer_api.routes.runs import router as runs_router
from slicer_api.routes.systems import router as systems_router
from slicer_api.storage import ensure_bucket
from slicer_api.systems_registry import ensure_systems_storage


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_systems_storage()
    ensure_bucket()
    yield


app = FastAPI(
    title="Slicer API",
    version="0.1.0",
    description="Orchestration API for dynamical systems computations",
    lifespan=lifespan,
)

REQUESTS = Counter("slicer_api_http_requests_total", "HTTP requests", ["method", "path", "status"])
LATENCY = Histogram("slicer_api_http_request_duration_seconds", "HTTP request duration", ["method", "path"])


@app.middleware("http")
async def metrics_middleware(request, call_next):
    path = request.url.path
    with LATENCY.labels(request.method, path).time():
        response = await call_next(request)
    REQUESTS.labels(request.method, path, response.status_code).inc()
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bifurcation_router)
app.include_router(runs_router)
app.include_router(phase_portrait_router)
app.include_router(registry_router)
app.include_router(systems_router)
app.mount("/metrics", make_asgi_app())


@app.get("/health")
def health():
    return {
        "status": "ok",
        "database_configured": bool(settings.database_url),
        "minio_configured": bool(settings.minio_endpoint),
    }
