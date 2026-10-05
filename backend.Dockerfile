FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates tini chromium && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt /app/backend/requirements.txt
RUN python3 -m venv /opt/media && /opt/media/bin/pip install --no-cache-dir -r /app/backend/requirements.txt && /opt/media/bin/pip install --no-cache-dir yt-dlp-getpot-wpc==1.1.2
COPY backend /app/backend
RUN mkdir -p /app/engines && chown -R node:node /app
USER node
ENV MEDIA_BIND=0.0.0.0 MEDIA_BIND_PORT=10000 FETCHLY_ENGINE_DIR=/app/engines FETCHLY_WPC_PROBE=1
EXPOSE 10000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/opt/media/bin/python", "/app/backend/server.py"]
