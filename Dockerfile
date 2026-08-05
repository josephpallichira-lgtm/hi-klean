FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
# public/index.html is built from client/, not committed
COPY client ./client
COPY build.cjs ./
RUN mkdir -p public && node build.cjs
ENV NODE_ENV=production
ENV TZ=Asia/Kolkata
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node","src/server.js"]
