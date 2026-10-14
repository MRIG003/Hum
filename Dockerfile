FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
COPY docker-entrypoint.sh ./docker-entrypoint.sh
# Starts as root only to fix ownership of the mounted data folder, then runs as "node".
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
