FROM node:24-bookworm-slim
# Runtime libraries Chromium/Electron needs on a slim Debian, plus Xvfb for
# headless launching and unzip for scripts/build-linux.sh.
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb unzip ca-certificates curl \
      libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xz-utils \
      libatspi2.0-0 libdrm2 libgbm1 libasound2 libxshmfence1 \
      libxkbcommon0 libpango-1.0-0 libcairo2 libglib2.0-0 \
      fonts-noto-cjk fonts-noto-color-emoji dbus \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
