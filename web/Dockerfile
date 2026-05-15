# Web demo: BFF (Express) + static frontend (Vite-built) in one image.
#
# Multi-stage so the runtime image only carries production deps and the
# compiled output. Run via docker-compose.yml in the repo root (the web
# service); requires the mcp service to be reachable at MCP_URL.

FROM node:22-alpine AS deps
WORKDIR /app
COPY web/package.json web/package-lock.json* ./
RUN npm ci --include=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json* ./
COPY --from=deps /app/node_modules ./node_modules
COPY web/tsconfig.json web/tsconfig.server.json web/vite.config.ts web/index.html ./
COPY web/server ./server
COPY web/src ./src
COPY web/public ./public
RUN npm run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
COPY web/package.json web/package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server/index.js"]
