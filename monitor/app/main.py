import asyncio
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse

from app.events import EventStats, consume_events
from app.health import HealthMonitor
from app.messages import (
    CHECK_POLLING_FIRST_SCAN,
    CHECK_POLLING_INVALID_TIMESTAMP,
    CHECK_POLLING_NOT_INITIALIZED,
    CHECK_POLLING_OK,
    CHECK_POLLING_STALE,
    CHECK_POLLING_TASK_STOPPED,
    STATE_DEGRADED,
    STATE_OK,
)


async def polling_loop(monitor, client):
    while True:
        await monitor.scan(client)
        await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app):
    monitor = HealthMonitor()
    app.state.monitor = monitor
    events = EventStats()
    app.state.events = events

    async with httpx.AsyncClient(timeout=2) as client:
        task = asyncio.create_task(polling_loop(monitor, client))
        events_task = asyncio.create_task(consume_events(events))
        app.state.polling_task = task
        app.state.events_task = events_task
        app.state.started_at = datetime.now(UTC)
        try:
            yield
        finally:
            for background in (task, events_task):
                background.cancel()
            for background in (task, events_task):
                with suppress(asyncio.CancelledError):
                    await background


app = FastAPI(
    title="In-Filtrados - Monitor Service",
    lifespan=lifespan,
)


@app.get("/health")
async def get_health():
    monitor = getattr(app.state, "monitor", None)
    task = getattr(app.state, "polling_task", None)
    started_at = getattr(app.state, "started_at", None)

    checks = {}

    if monitor is None or task is None or started_at is None:
        checks["polling"] = CHECK_POLLING_NOT_INITIALIZED
    elif task.done():
        checks["polling"] = CHECK_POLLING_TASK_STOPPED
    else:
        now = datetime.now(UTC)

        if monitor.last_scan_at is None:
            startup_age = (now - started_at).total_seconds()

            if startup_age <= 10:
                checks["polling"] = CHECK_POLLING_OK
            else:
                checks["polling"] = CHECK_POLLING_FIRST_SCAN
        else:
            try:
                last_scan = datetime.fromisoformat(monitor.last_scan_at)
                scan_age = (now - last_scan).total_seconds()

                if scan_age <= 15:
                    checks["polling"] = CHECK_POLLING_OK
                else:
                    checks["polling"] = CHECK_POLLING_STALE
            except (ValueError, TypeError):
                checks["polling"] = CHECK_POLLING_INVALID_TIMESTAMP

    healthy = all(
        value == CHECK_POLLING_OK
        for value in checks.values()
    )

    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": STATE_OK if healthy else STATE_DEGRADED,
            "service": "monitor",
            "checks": checks,
        },
    )

@app.get("/", response_class=FileResponse)
async def get_dashboard():
    path = Path(__file__).resolve().parent / "dashboard" / "index.html"
    return FileResponse(path)

@app.get("/api/status")
async def get_status():
    return app.state.monitor.snapshot()


@app.get("/api/stats")
async def get_stats():
    return app.state.events.snapshot()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
