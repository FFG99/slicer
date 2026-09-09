FROM debian:bookworm-slim AS core-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    cmake \
    g++ \
    make \
    libhdf5-dev \
    libomp-dev \
    && rm -rf /var/lib/apt/lists/*

COPY core /src/core
WORKDIR /src/core
RUN rm -rf build && cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build -- -j"$(nproc)"


FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    libhdf5-103-1 \
    libhdf5-cpp-103-1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=core-builder /src/core/build/slicer /usr/local/bin/slicer
COPY --from=core-builder /src/core/build/slicer-probe-system /usr/local/bin/slicer-probe-system
COPY --from=core-builder /src/core/build/systems /usr/local/lib/slicer/seed/systems
COPY core/include /usr/local/share/slicer/include
COPY schemas/systems-registry.yaml /usr/local/lib/slicer/seed/systems-registry.yaml
COPY deploy/init-systems.sh /usr/local/bin/init-systems.sh
RUN chmod +x /usr/local/bin/init-systems.sh

WORKDIR /app

ENV PYTHONPATH=/app
ENV PIP_DEFAULT_TIMEOUT=120
ENV REGISTRY_PATH=/app/schemas/calculation-registry.yaml
ENV SLICER_BIN=/usr/local/bin/slicer
ENV SLICER_SYSTEMS_DIR=/var/lib/slicer/systems
ENV SLICER_SYSTEMS_SEED=/usr/local/lib/slicer/seed
ENV SYSTEMS_REGISTRY_PATH=/var/lib/slicer/systems/systems-registry.yaml
ENV SLICER_CORE_INCLUDE=/usr/local/share/slicer/include
ENV SLICER_PROBE_BIN=/usr/local/bin/slicer-probe-system
ENV WORK_DIR=/tmp/slicer-api

RUN pip install --no-cache-dir --upgrade pip

COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api/slicer_api ./slicer_api
COPY schemas /app/schemas

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/init-systems.sh"]
CMD ["uvicorn", "slicer_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
