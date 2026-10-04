FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@12.3.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/media && /opt/media/bin/pip install --no-cache-dir -r /tmp/requirements.txt
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY backend ./backend
COPY scripts/start-container.sh ./scripts/start-container.sh
RUN mkdir -p /app/engines && chmod +x scripts/start-container.sh && chown -R node:node /app
USER node
ENV NODE_ENV=production HOSTNAME=0.0.0.0 MEDIA_BACKEND_URL=http://127.0.0.1:8787
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./scripts/start-container.sh"]
