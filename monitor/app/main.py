import asyncio
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse

from app.health import HealthMonitor


async def polling_loop(monitor, client):
    while True:
        await monitor.scan(client)
        await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app):
    monitor = HealthMonitor()
    app.state.monitor = monitor

    async with httpx.AsyncClient(timeout=2) as client:
        task = asyncio.create_task(polling_loop(monitor, client))
        app.state.polling_task = task
        app.state.started_at = datetime.now(UTC)
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


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
        checks["polling"] = "fail: monitoring not initialized"
    elif task.done():
        checks["polling"] = "fail: monitoring task stopped"
    else:
        now = datetime.now(UTC)

        if monitor.last_scan_at is None:
            startup_age = (now - started_at).total_seconds()

            if startup_age <= 10:
                checks["polling"] = "ok"
            else:
                checks["polling"] = "fail: first scan not completed"
        else:
            try:
                last_scan = datetime.fromisoformat(monitor.last_scan_at)
                scan_age = (now - last_scan).total_seconds()

                if scan_age <= 15:
                    checks["polling"] = "ok"
                else:
                    checks["polling"] = "fail: monitoring results are stale"
            except (ValueError, TypeError):
                checks["polling"] = "fail: invalid scan timestamp"

    healthy = all(value == "ok" for value in checks.values())

    return JSONResponse(
        status_code=200 if healthy else 503,
        content={
            "status": "ok" if healthy else "degraded",
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )