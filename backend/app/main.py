from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.db import verify_connection
from app.logger import get_logger, setup_logging
from app.middleware import (
    auth_middleware,
    rate_limit_middleware,
    request_id_middleware,
)
from app.routes.editorial import router as editorial_router
from app.routes.query import router as query_router
from app.settings import settings
from app.voice.handler import handle_voice_ws

log = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    setup_logging()
    log.info(
        "Aperture backend starting",
        extra={"env": settings.ENV, "log_level": settings.LOG_LEVEL},
    )
    verify_connection()
    log.info("Aperture backend ready")
    yield
    log.info("Aperture backend shutting down")


app = FastAPI(
    title="Aperture Backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)

# Middlewares registered LAST run OUTERMOST. Order matters:
#   rate_limit (inner) registered first, then auth, then request_id (outer)
#   so the request_id is minted before auth/rate_limit log it.
app.middleware("http")(rate_limit_middleware)
app.middleware("http")(auth_middleware)
app.middleware("http")(request_id_middleware)
app.include_router(query_router, prefix="/api")
app.include_router(editorial_router, prefix="/api")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "aperture-backend"}


@app.get("/api/auth/status")
async def auth_status() -> dict[str, bool]:
    """Public: tells the frontend whether the auth gate is enabled."""
    return {"auth_required": bool(settings.AUTH_KEY)}


@app.get("/api/auth/verify")
async def auth_verify() -> dict[str, bool]:
    """Reached only if the auth middleware accepted the header."""
    return {"ok": True}


@app.websocket("/ws/voice")
async def voice_ws_endpoint(
    websocket: WebSocket,
    conversation_id: str = "",
    auth_key: str = "",
) -> None:
    """Voice mode entry. One WS per browser session — no reconnect.

    WebSockets bypass HTTP middleware, so auth is checked here against
    the `auth_key` query string. When AUTH_KEY is unset the gate is off.
    """
    if settings.AUTH_KEY and auth_key != settings.AUTH_KEY:
        await websocket.close(code=1008, reason="Invalid or missing auth key")
        return
    await handle_voice_ws(websocket, conversation_id)
