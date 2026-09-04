# ---------- stage 1: build the browser app ----------
# React + TypeScript, compiled by Vite. Kept in its own stage so none of the
# front-end toolchain ends up in the image that runs the clinic.
FROM node:22-alpine AS web
WORKDIR /build
COPY web/package*.json web/
RUN cd web && npm ci
COPY web ./web
COPY build_pwa.cjs ./
RUN cd web && npm run build
# index.html + assets/ are written to /build/public by Vite; the PWA assets
# (manifest, service worker, icons) are generated from committed sources. They
# used to live only in an uncommitted public/, so an image built without them
# answered /manifest.webmanifest with index.html at HTTP 200 — a silent failure
# that passes a status check and breaks Add to Home Screen.
RUN node build_pwa.cjs

# ---------- stage 2: the server ----------
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
COPY --from=web /build/public ./public
# The Railway cron service starts this file with `node backup.mjs`. It must be
# in the image or the nightly backup crashes with MODULE_NOT_FOUND.
COPY backup.mjs ./
ENV NODE_ENV=production
ENV TZ=Asia/Kolkata
EXPOSE 3000
# Railway injects PORT; a hard-coded 3000 here fails the check on any other port.
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1
CMD ["node","src/server.js"]
