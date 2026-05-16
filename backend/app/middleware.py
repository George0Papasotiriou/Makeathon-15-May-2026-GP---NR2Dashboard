import time
import uuid
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse

from app.logger import get_logger
from app.settings import settings

log_req = get_logger("middleware.request_id")
log_rate = get_logger("middleware.rate_limit")
log_auth = get_logger("middleware.auth")


async def request_id_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Attach a request_id to every request for end-to-end traceability.

    If the client sends X-Request-Id, we honor it. Otherwise we mint one.
    The id is exposed on response headers so the frontend can log it.
    """
    request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
    request.state.request_id = request_id

    log_req.info(
        "Request received",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
        },
    )

    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id

    log_req.info(
        "Request completed",
        extra={
            "request_id": request_id,
            "status": response.status_code,
        },
    )

    return response


# ---------------------------------------------------------------------------
# Rate limit middleware — sliding window per client IP. Stdlib only.
# 30 requests per 60 seconds. /api/health is exempt.
# ---------------------------------------------------------------------------

RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 30
_RATE_LIMIT_SKIP_PATHS = frozenset({"/api/health"})

_request_timestamps: dict[str, deque[float]] = defaultdict(deque)


async def rate_limit_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Per-IP sliding-window rate limiter.

    Skips /api/health so liveness probes never get throttled. Returns 429
    with `Retry-After` header + JSON body when the window is full.
    """
    if request.url.path in _RATE_LIMIT_SKIP_PATHS:
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    timestamps = _request_timestamps[client_ip]

    cutoff = now - RATE_LIMIT_WINDOW_SECONDS
    while timestamps and timestamps[0] < cutoff:
        timestamps.popleft()

    if len(timestamps) >= RATE_LIMIT_MAX_REQUESTS:
        retry_after = int(RATE_LIMIT_WINDOW_SECONDS - (now - timestamps[0])) + 1
        request_id = getattr(request.state, "request_id", "unknown")
        log_rate.warning(
            "Rate limit exceeded",
            extra={
                "request_id": request_id,
                "client_ip": client_ip,
                "count": len(timestamps),
                "limit": RATE_LIMIT_MAX_REQUESTS,
                "window_seconds": RATE_LIMIT_WINDOW_SECONDS,
                "retry_after": retry_after,
            },
        )
        return JSONResponse(
            status_code=429,
            content={
                "detail": (
                    f"Rate limit: max {RATE_LIMIT_MAX_REQUESTS} requests "
                    f"per {RATE_LIMIT_WINDOW_SECONDS}s"
                ),
                "retry_after_seconds": retry_after,
            },
            headers={"Retry-After": str(retry_after)},
        )

    timestamps.append(now)
    return await call_next(request)


# ---------------------------------------------------------------------------
# Auth middleware — blocks all /api/* requests lacking valid X-Auth-Key header.
# /api/health is exempt so liveness probes still work. OPTIONS (CORS preflight)
# also exempt. If AUTH_KEY is empty in settings, the gate is disabled.
# ---------------------------------------------------------------------------

_AUTH_SKIP_PATHS = frozenset({"/api/health", "/api/auth/status"})


async def auth_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    if not settings.AUTH_KEY:
        return await call_next(request)
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path in _AUTH_SKIP_PATHS:
        return await call_next(request)

    provided = request.headers.get("X-Auth-Key", "")
    if provided != settings.AUTH_KEY:
        request_id = getattr(request.state, "request_id", "unknown")
        log_auth.warning(
            "Unauthorized request",
            extra={
                "request_id": request_id,
                "path": request.url.path,
                "has_header": bool(provided),
            },
        )
        # CORSMiddleware is innermost and never sees responses that earlier
        # middlewares return directly. Echo CORS headers manually so the
        # browser can read the 401 cross-origin.
        origin = request.headers.get("origin", "")
        cors_headers: dict[str, str] = {}
        if origin and origin in settings.cors_origins_list:
            cors_headers["Access-Control-Allow-Origin"] = origin
            cors_headers["Access-Control-Allow-Credentials"] = "true"
            cors_headers["Vary"] = "Origin"
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid or missing auth key"},
            headers=cors_headers,
        )

    return await call_next(request)
