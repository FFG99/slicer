# Slicer core (C++)

Computational kernel: dynamical system plugins, calculators, HDF5 artifact writer.

## Dependencies

- CMake 3.20+
- C++20 compiler
- HDF5
- OpenMP
- GoogleTest

On macOS with Homebrew:

```bash
brew install cmake hdf5 libomp googletest
```

## Build

```bash
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```

## Run a computation

```bash
./build/slicer run \
  --job examples/henon_attraction_map.json \
  --output /tmp/henon_am.h5 \
  --systems-dir build/systems
```

Or set `SLICER_SYSTEMS_DIR=build/systems`.

## Layout

```
include/slicer/
  systems/          SystemBase, plugin loader
  artifact/         ArtifactFile, CoordinateFrame
  calculations/     AttractionMap
  io/               JobSpec JSON parser
systems/            .dylib/.so plugins (henon, chialvo, universal2d)
src/                implementations
tests/
examples/           sample job JSON files
```

Calculations: `attraction_map`, `pool_of_attraction`, `lyapunov_spectrum`,
`dynamic_modes`, `integrate`.

## Artifact format (HDF5)

```
/metadata     version, calculation_type, system, created_at, frame (JSON)
/parameters   json (job parameters)
/artifacts/main/
  values      uint64[steps, steps]
  @finished
```
