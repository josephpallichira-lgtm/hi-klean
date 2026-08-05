FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
# public/ is built entirely by build.cjs — index.html AND the PWA assets
# (manifest, service worker, icons). Nothing under public/ is committed, so
# nothing here may COPY it.
COPY client ./client
COPY build.cjs ./
RUN node build.cjs
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
