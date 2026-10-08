FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build -w gateway

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app /app

EXPOSE 3000

CMD ["npm", "run", "start", "-w", "gateway"]