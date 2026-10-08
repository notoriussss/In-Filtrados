FROM golang:1.25-bookworm AS build

WORKDIR /app/match
COPY match/go.mod match/go.sum ./
RUN go mod download

COPY match/ ./
RUN CGO_ENABLED=0 go build -o /out/match ./cmd/match

FROM debian:bookworm-slim AS runtime

WORKDIR /app
COPY --from=build /out/match /app/match
COPY shared/ /app/shared/

EXPOSE 8081 50051

CMD ["/app/match"]
