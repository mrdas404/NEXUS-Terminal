FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc --outDir dist

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=10000 CORE_DB_PATH=/data/core.sqlite RESEARCH_DB_PATH=/data/research.sqlite
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app --home-dir /app app && mkdir -p /data /backups && chown app:app /data /backups
COPY --from=build --chown=app:app /app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=app:app /app/dist ./dist
USER app
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/server.js"]
