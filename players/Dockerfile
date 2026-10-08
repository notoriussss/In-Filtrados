FROM rust:bookworm AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY proto/ ./proto/
COPY players/ ./players/

WORKDIR /app/players
RUN cargo build --release --locked

FROM debian:bookworm-slim AS runtime

WORKDIR /app
COPY --from=build /app/players/target/release/players /app/players

EXPOSE 8082 50052

CMD ["/app/players"]