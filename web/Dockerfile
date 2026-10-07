# Built from the repo root: docker build -f web/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY messages/ messages/
COPY web/package.json web/
COPY gateway/package.json gateway/
RUN npm ci -w web
COPY shared/ shared/
COPY web/ web/
RUN npm run build -w web

FROM nginx:alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
