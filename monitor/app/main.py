from fastapi import FastAPI, status

app = FastAPI(title="In-Filtrados - Monitor Service")


@app.get("/health", status_code=status.HTTP_200_OK)
async def get_health():
    return {
        "status": "ok",
        "service": "monitor",
        "checks": {}
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
