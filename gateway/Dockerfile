FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY messages/ messages/
COPY web/package.json web/
COPY gateway/ gateway/
RUN npm ci -w gateway
RUN npm run build -w gateway

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json package-lock.json ./
COPY messages/ messages/
COPY web/package.json web/
COPY gateway/package.json gateway/
RUN npm ci -w gateway --omit=dev
COPY --from=build /app/gateway/dist gateway/dist
COPY proto/ proto/
EXPOSE 3000
CMD ["node", "gateway/dist/main.js"]
