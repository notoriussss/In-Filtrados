FROM python:3.12-slim AS build

WORKDIR /build
COPY monitor/ ./
RUN pip wheel --no-cache-dir --wheel-dir /wheels .

FROM python:3.12-slim AS runtime

WORKDIR /app/monitor
COPY --from=build /wheels /wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels monitor \
    && rm -rf /wheels

COPY monitor/app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
