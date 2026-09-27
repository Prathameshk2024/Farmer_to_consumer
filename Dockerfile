# ─────────────────────────────────────────────────────────────────────
# Jawahar Shetkari Bazar — backend API  (production Docker image)
#
# Build context MUST be the REPOSITORY ROOT because the backend's
# tsconfig.json sets rootDir: ".." and compiles ../shared/src/.
#
# Build:  docker build -t f2c-api .
# Run:    docker run --env-file backend/.env -p 4000:4000 f2c-api
#
# Cloud Run sets PORT automatically; the app reads process.env.PORT
# and defaults to 4000 if unset.
# ─────────────────────────────────────────────────────────────────────


# ── Stage 1: install ALL deps + compile TypeScript ──────────────────
FROM node:22-alpine AS build

WORKDIR /app

# 1) Copy every workspace package.json so the lockfile resolves.
#    npm ci rejects the lockfile if any workspace listed in the root
#    package.json is missing, so frontend/ and admin/ manifests are
#    included even though their source is never copied.
COPY package.json package-lock.json ./
COPY shared/package.json  shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY admin/package.json    admin/

RUN npm ci

# 2) Copy only the source the backend build needs.
COPY shared/src/           shared/src/
COPY backend/src/          backend/src/
COPY backend/tsconfig.json backend/
COPY backend/scripts/      backend/scripts/

# 3) tsc compiles backend/ + shared/ into backend/dist/.
#    fix-shared-imports.js rewrites @shared/* bare specifiers to
#    relative paths so plain `node` can resolve them at runtime.
RUN npm --workspace=@f2c/backend run build


# ── Stage 2: production image (no TS, no devDeps, Alpine) ───────────
FROM node:22-alpine

WORKDIR /app

# Re-copy manifests and install production deps only.
# --omit=dev drops typescript, tsx, @types/*, concurrently, etc.
COPY package.json package-lock.json ./
COPY shared/package.json  shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY admin/package.json    admin/

RUN npm ci --omit=dev && npm cache clean --force

# Compiled JS (import paths already rewritten by fix-shared-imports).
COPY --from=build /app/backend/dist backend/dist

# Non-root user for security.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Environment variables are injected at runtime by Cloud Run / docker run.
# No .env file is baked into the image.
ENV NODE_ENV=production

# Cloud Run provides PORT; the backend defaults to 4000 if unset.
EXPOSE 4000

# Start the compiled backend directly.
# --env-file-if-exists is omitted because there is no .env inside the
# container; all config arrives via runtime environment variables.
CMD ["node", "backend/dist/backend/src/index.js"]