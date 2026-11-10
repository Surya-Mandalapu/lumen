FROM node:22-alpine AS web-build
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LUMEN_STATIC_DIR=/app/apps/web/dist
WORKDIR /app
COPY backend backend
RUN pip install --no-cache-dir ./backend
COPY scripts/data/prepare_kernels.py scripts/data/prepare_kernels.py
RUN python scripts/data/prepare_kernels.py
COPY --from=web-build /workspace/apps/web/dist apps/web/dist
COPY data/derived/pgda-demo-v1 data/derived/pgda-demo-v1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8000"]

