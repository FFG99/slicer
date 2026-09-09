#!/bin/sh
set -eu

SYSTEMS_DIR="${SLICER_SYSTEMS_DIR:-/var/lib/slicer/systems}"
SEED_DIR="${SLICER_SYSTEMS_SEED:-/usr/local/lib/slicer/seed}"

mkdir -p "$SYSTEMS_DIR"

if [ -d "$SEED_DIR/systems" ]; then
  for plugin in "$SEED_DIR"/systems/*; do
    [ -f "$plugin" ] || continue
    name=$(basename "$plugin")
    if [ ! -f "$SYSTEMS_DIR/$name" ]; then
      cp "$plugin" "$SYSTEMS_DIR/$name"
    fi
  done
fi

registry="$SYSTEMS_DIR/systems-registry.yaml"
if [ ! -f "$registry" ] && [ -f "$SEED_DIR/systems-registry.yaml" ]; then
  cp "$SEED_DIR/systems-registry.yaml" "$registry"
fi

for legacy in "$SYSTEMS_DIR"/lib*_plugin.so "$SYSTEMS_DIR"/lib*_plugin.dylib; do
  [ -f "$legacy" ] || continue
  base=$(basename "$legacy")
  name=${base#lib}
  name=${name%_plugin.so}
  name=${name%_plugin.dylib}
  if [ -f "$SYSTEMS_DIR/$name.so" ] || [ -f "$SYSTEMS_DIR/$name.dylib" ]; then
    rm -f "$legacy"
  fi
done

exec "$@"
