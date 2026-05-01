FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY cli/package.json cli/package.json
COPY core/package.json core/package.json
COPY sources/package.json sources/package.json
COPY web/package.json web/package.json
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm -w @highli/web run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/web ./web
COPY --from=build /app/core ./core
COPY --from=build /app/sources ./sources
EXPOSE 3000
