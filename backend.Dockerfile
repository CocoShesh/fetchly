FROM node:24-trixie-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates tini curl unzip xvfb xauth libgtk-3-0 libdbus-glib-1-2 libxt6 libasound2 libx11-xcb1 libxcomposite1 libxcursor1 libxdamage1 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 libegl1 libgl1-mesa-dri libgbm1 fonts-liberation fonts-noto-color-emoji fontconfig && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt /app/backend/requirements.txt
RUN python3 -m venv /opt/media && /opt/media/bin/pip install --no-cache-dir -r /app/backend/requirements.txt
COPY backend/camofox-probe/package*.json /app/backend/camofox-probe/
RUN cd /app/backend/camofox-probe && npm ci --omit=dev --ignore-scripts
RUN mkdir -p /opt/camoufox && curl -fSL https://github.com/daijro/camoufox/releases/download/v152.0.4-beta.28/camoufox-152.0.4-beta.28-lin.x86_64.zip -o /tmp/camoufox.zip && unzip -q /tmp/camoufox.zip -d /opt/camoufox && chmod -R a+rX /opt/camoufox && chmod a+x /opt/camoufox/camoufox-bin && rm /tmp/camoufox.zip
RUN python3 -c 'import json; json.dump({"version":"152.0.4","release":"beta.28"}, open("/opt/camoufox/version.json", "w"))'
COPY backend /app/backend
RUN mkdir -p /app/engines && chown -R node:node /app
USER node
ENV MEDIA_BIND=0.0.0.0 MEDIA_BIND_PORT=10000 FETCHLY_ENGINE_DIR=/app/engines
EXPOSE 10000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/opt/media/bin/python", "/app/backend/server.py"]
