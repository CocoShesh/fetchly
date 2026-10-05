FROM node:24-bookworm-slim AS cobaltbuild
RUN apt-get update && apt-get install -y --no-install-recommends git python3 build-essential ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /src/cobalt
RUN git init && git remote add origin https://github.com/imputnet/cobalt.git && git fetch --depth=1 origin a636575b09de1fc55d9b8cd98cac88f5f2f16b42 && git checkout --detach FETCH_HEAD
RUN corepack enable && pnpm install --prod --frozen-lockfile && pnpm deploy --filter=@imput/cobalt-api --prod /prod/cobalt
RUN cp LICENSE /prod/cobalt/COBALT-LICENSE && cp api/LICENSE /prod/cobalt/LICENSE && cp -r .git /prod/cobalt/.git
FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates tini && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt /app/backend/requirements.txt
RUN python3 -m venv /opt/media && /opt/media/bin/pip install --no-cache-dir -r /app/backend/requirements.txt
COPY --from=cobaltbuild /prod/cobalt /opt/cobalt
COPY backend /app/backend
RUN mkdir -p /app/engines && chown -R node:node /app
USER node
ENV MEDIA_BIND=0.0.0.0 MEDIA_BIND_PORT=10000 FETCHLY_ENGINE_DIR=/app/engines
EXPOSE 10000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/opt/media/bin/python", "/app/backend/server.py"]
