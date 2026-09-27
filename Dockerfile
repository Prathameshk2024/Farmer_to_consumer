# ─────────────────────────────────────────────────────────────────────
# Jawahar Shetkari Bazar — backend API
#
# Multi-stage build.  Context MUST be the REPOSITORY ROOT because
# the backend TypeScript compilation includes ../shared/src/.
#
# Build:  docker build -t f2c-api .
# Run:    docker run -p 4000:4000 --env-file backend/.env f2c-api
#         Never with a .env that holds the PRODUCTION Firebase key: that
#         container is a second process writing the live database
#         (docs/DEPLOY.md, "Exactly one instance").
# ─────────────────────────────────────────────────────────────────────

# ── Stage 1: install dependencies + compile TypeScript ──────────────
FROM node:22-slim AS build

WORKDIR /app

# Copy every workspace package.json so the lockfile resolves correctly.
# npm ci rejects the lockfile if any workspace listed in the root
# package.json is missing, so frontend/ and admin/ manifests are
# included even though their source is never copied.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY admin/package.json admin/

RUN npm ci

# Copy only the source the backend compilation needs.
COPY shared/src/ shared/src/
COPY backend/src/ backend/src/
COPY backend/tsconfig.json backend/
COPY backend/scripts/ backend/scripts/

# tsc compiles both backend/ and shared/ into backend/dist/.
# fix-shared-imports.js rewrites the @shared/* bare specifiers to
# relative paths so plain `node` can resolve them at runtime.
RUN npm --workspace=@f2c/backend run build


# ── Stage 2: production image (no TypeScript, no devDeps) ───────────
FROM node:22-slim

WORKDIR /app

# Re-copy manifests and install production dependencies only.
# --omit=dev drops typescript, tsx, vite, @types/*, concurrently, etc.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY admin/package.json admin/

RUN npm ci --omit=dev

# Compiled backend + shared code (import paths already rewritten).
COPY --from=build /app/backend/dist backend/dist

# Environment variables are injected at runtime by Docker / Cloud Run.
# No .env file is baked into the image.
ENV NODE_ENV=production

EXPOSE 4000

# Start the API directly with plain node.
# --env-file-if-exists is omitted because there is no .env inside the
# container; all configuration arrives via runtime environment variables.
CMD ["node", "backend/dist/backend/src/index.js"]