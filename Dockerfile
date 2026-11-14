FROM node:22-alpine AS web-build
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
RUN npm run build

FROM python:3.12-slim AS science-data
WORKDIR /workspace
RUN apt-get update && apt-get install --yes --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "numpy>=1.26,<2" "rasterio==1.4.3"
COPY scripts/data/prepare_global.py scripts/data/prepare_global.py
COPY scripts/data/install_cap_release.py scripts/data/install_cap_release.py
RUN python scripts/data/prepare_global.py && python scripts/data/install_cap_release.py

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LUMEN_STATIC_DIR=/app/apps/web/dist \
    LUMEN_ENV=production \
    LUMEN_DATA_ROOT=/app/data/derived/lunar-south-cap-v1 \
    LUMEN_GLOBAL_ROOT=/app/data/derived/global-preview-v1
WORKDIR /app
COPY backend backend
RUN pip install --no-cache-dir ./backend
COPY scripts/data/prepare_kernels.py scripts/data/prepare_kernels.py
RUN python scripts/data/prepare_kernels.py
COPY --from=web-build /workspace/apps/web/dist apps/web/dist
COPY data/derived/pgda-demo-v1 data/derived/pgda-demo-v1
COPY --from=science-data /workspace/data/derived/global-preview-v1 data/derived/global-preview-v1
COPY --from=science-data /workspace/data/derived/lunar-south-cap-v1 data/derived/lunar-south-cap-v1
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port \"${PORT:-8000}\""]

