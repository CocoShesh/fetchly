FROM mcr.microsoft.com/dotnet/sdk:8.0-bookworm-slim AS youtube-probe-build
WORKDIR /probe
COPY backend/youtube-probe/ ./
RUN dotnet publish -c Release -r linux-x64 --self-contained true -o /probe/out -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates tini && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt /app/backend/requirements.txt
RUN python3 -m venv /opt/media && /opt/media/bin/pip install --no-cache-dir -r /app/backend/requirements.txt
COPY backend /app/backend
RUN mkdir -p /app/engines && chown -R node:node /app
COPY --from=youtube-probe-build /probe/out /opt/youtube-probe
USER node
ENV MEDIA_BIND=0.0.0.0 MEDIA_BIND_PORT=10000 FETCHLY_ENGINE_DIR=/app/engines
EXPOSE 10000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/opt/media/bin/python", "/app/backend/server.py"]
