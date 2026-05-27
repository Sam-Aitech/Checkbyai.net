# ─────────────────────────────────────────────────────────────
# Stage 1: Build
# Compiles TypeScript server + builds Vite React frontend
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile

# Copy source
COPY . .

# Build: Vite frontend → dist/public, esbuild server → dist/index.js
RUN npm run build
RUN npm prune --omit=dev

# ─────────────────────────────────────────────────────────────
# Stage 2: Runtime
# Minimal image — no dev dependencies, no source files
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Install security updates + runtime tools
RUN apk update && apk upgrade && apk add --no-cache \
    curl \
    bash \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S checkbyai -u 1001 -G nodejs

WORKDIR /app

# Copy only production node_modules and built output from builder
COPY --from=builder --chown=checkbyai:nodejs /app/package.json ./
RUN npm prune --omit=dev
COPY --from=builder --chown=checkbyai:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=checkbyai:nodejs /app/dist ./dist
COPY --from=builder --chown=checkbyai:nodejs /app/migrations ./migrations
COPY --from=builder --chown=checkbyai:nodejs /app/shared ./shared
COPY --from=builder --chown=checkbyai:nodejs /app/scripts ./scripts

# Binary dependencies directory (populated at runtime via setup-binaries.sh)
RUN mkdir -p /app/bin && chown checkbyai:nodejs /app/bin

# Drop to non-root
USER checkbyai

# Port the Express server listens on
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Run with auto-migration
CMD ["npm", "run", "start:with-migrate"]
