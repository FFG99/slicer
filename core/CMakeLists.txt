cmake_minimum_required(VERSION 3.20)
project(slicer VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)

FetchContent_Declare(
  nlohmann_json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
)
FetchContent_Declare(
  googletest
  URL https://github.com/google/googletest/archive/refs/tags/v1.15.2.tar.gz
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(nlohmann_json googletest)

if(APPLE)
  execute_process(
    COMMAND brew --prefix libomp
    OUTPUT_VARIABLE LIBOMP_PREFIX
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
  )
  if(LIBOMP_PREFIX)
    set(OpenMP_CXX_FLAGS "-Xpreprocessor -fopenmp -I${LIBOMP_PREFIX}/include")
    set(OpenMP_C_FLAGS "-Xpreprocessor -fopenmp -I${LIBOMP_PREFIX}/include")
    set(OpenMP_CXX_LIB_NAMES omp)
    set(OpenMP_omp_LIBRARY "${LIBOMP_PREFIX}/lib/libomp.dylib")
  endif()
endif()

find_package(OpenMP REQUIRED)
find_package(HDF5 REQUIRED COMPONENTS CXX)

if(TARGET HDF5::HDF5)
  set(SLICER_HDF5_TARGET HDF5::HDF5)
elseif(TARGET HDF5::hdf5_cpp)
  set(SLICER_HDF5_TARGET HDF5::hdf5_cpp)
else()
  message(FATAL_ERROR "Could not find a suitable HDF5 imported target")
endif()

set(SLICER_CORE_SOURCES
  src/calculations/Bifurcation.cpp
  src/artifact/CoordinateFrame.cpp
  src/artifact/ArtifactFile.cpp
  src/calculations/AttractorFingerprint.cpp
  src/calculations/AttractionMapParams.cpp
  src/calculations/AttractionMap.cpp
  src/calculations/DynamicModesParams.cpp
  src/calculations/DynamicModes.cpp
  src/calculations/IntegrateParams.cpp
  src/calculations/Integrate.cpp
  src/calculations/LyapunovExponents.cpp
  src/calculations/LyapunovSpectrumParams.cpp
  src/calculations/LyapunovSpectrum.cpp
  src/calculations/PoolOfAttractionParams.cpp
  src/calculations/PoolOfAttraction.cpp
  src/io/JobSpec.cpp
)

add_library(slicer_core STATIC ${SLICER_CORE_SOURCES})
target_include_directories(slicer_core PUBLIC include)
target_link_libraries(slicer_core PUBLIC ${SLICER_HDF5_TARGET} nlohmann_json::nlohmann_json OpenMP::OpenMP_CXX)

set(SYSTEMS_OUTPUT_DIR "${CMAKE_BINARY_DIR}/systems")
file(MAKE_DIRECTORY "${SYSTEMS_OUTPUT_DIR}")
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY "${SYSTEMS_OUTPUT_DIR}")

file(GLOB SYSTEM_SOURCES CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/systems/*.cpp")
set(SYSTEM_PLUGIN_TARGETS "")
foreach(SYSTEM_SOURCE ${SYSTEM_SOURCES})
  get_filename_component(SYSTEM_NAME ${SYSTEM_SOURCE} NAME_WE)
  add_library(${SYSTEM_NAME}_plugin SHARED ${SYSTEM_SOURCE})
  target_include_directories(${SYSTEM_NAME}_plugin PRIVATE include)
  set_target_properties(${SYSTEM_NAME}_plugin PROPERTIES
    PREFIX ""
    OUTPUT_NAME ${SYSTEM_NAME}
  )
  if(APPLE)
    set_target_properties(${SYSTEM_NAME}_plugin PROPERTIES SUFFIX ".dylib")
  endif()
  list(APPEND SYSTEM_PLUGIN_TARGETS ${SYSTEM_NAME}_plugin)
endforeach()

add_executable(slicer src/cli/main.cpp)
target_link_libraries(slicer PRIVATE slicer_core)

add_executable(slicer-probe-system tools/probe_system.cpp)
target_include_directories(slicer-probe-system PRIVATE include)
if(UNIX AND NOT APPLE)
  target_link_libraries(slicer-probe-system PRIVATE dl)
endif()

enable_testing()

set(SLICER_SYSTEMS_DIR "${SYSTEMS_OUTPUT_DIR}")

function(add_slicer_test target sources)
  add_executable(${target} ${sources})
  target_include_directories(${target} PRIVATE include)
  target_link_libraries(${target} PRIVATE GTest::gtest_main slicer_core)
  add_test(NAME ${target} COMMAND ${target})
endfunction()

add_slicer_test(test_henon tests/test_henon.cpp systems/henon.cpp)
add_slicer_test(test_chialvo tests/test_chialvo.cpp systems/chialvo.cpp)
add_slicer_test(test_universal2d tests/test_universal2d.cpp systems/universal2d.cpp)

add_executable(test_system_manager tests/test_system_manager.cpp)
target_include_directories(test_system_manager PRIVATE include)
target_link_libraries(test_system_manager PRIVATE GTest::gtest_main slicer_core)
target_compile_definitions(test_system_manager PRIVATE SLICER_SYSTEMS_DIR="${SLICER_SYSTEMS_DIR}")
add_dependencies(test_system_manager ${SYSTEM_PLUGIN_TARGETS})
add_test(NAME test_system_manager COMMAND test_system_manager)

add_slicer_test(test_artifact tests/test_artifact.cpp)

add_executable(test_attractor_fingerprint tests/test_attractor_fingerprint.cpp)
target_include_directories(test_attractor_fingerprint PRIVATE include)
target_link_libraries(test_attractor_fingerprint PRIVATE GTest::gtest_main slicer_core)
add_test(NAME test_attractor_fingerprint COMMAND test_attractor_fingerprint)

add_executable(test_integrate tests/test_integrate.cpp)
target_include_directories(test_integrate PRIVATE include)
target_link_libraries(test_integrate PRIVATE GTest::gtest_main slicer_core)
target_compile_definitions(test_integrate PRIVATE SLICER_SYSTEMS_DIR="${SLICER_SYSTEMS_DIR}")
add_dependencies(test_integrate ${SYSTEM_PLUGIN_TARGETS})
add_test(NAME test_integrate COMMAND test_integrate)

add_executable(test_attraction_map tests/test_attraction_map.cpp)
target_include_directories(test_attraction_map PRIVATE include)
target_link_libraries(test_attraction_map PRIVATE GTest::gtest_main slicer_core)
target_compile_definitions(test_attraction_map PRIVATE SLICER_SYSTEMS_DIR="${SLICER_SYSTEMS_DIR}")
add_dependencies(test_attraction_map ${SYSTEM_PLUGIN_TARGETS})
add_test(NAME test_attraction_map COMMAND test_attraction_map)

add_executable(test_pool_of_attraction tests/test_pool_of_attraction.cpp)
target_include_directories(test_pool_of_attraction PRIVATE include)
target_link_libraries(test_pool_of_attraction PRIVATE GTest::gtest_main slicer_core)
target_compile_definitions(test_pool_of_attraction PRIVATE SLICER_SYSTEMS_DIR="${SLICER_SYSTEMS_DIR}")
add_dependencies(test_pool_of_attraction ${SYSTEM_PLUGIN_TARGETS})
add_test(NAME test_pool_of_attraction COMMAND test_pool_of_attraction)

add_executable(test_lyapunov_spectrum tests/test_lyapunov_spectrum.cpp)
target_include_directories(test_lyapunov_spectrum PRIVATE include)
target_link_libraries(test_lyapunov_spectrum PRIVATE GTest::gtest_main slicer_core)
target_compile_definitions(test_lyapunov_spectrum PRIVATE SLICER_SYSTEMS_DIR="${SLICER_SYSTEMS_DIR}")
add_dependencies(test_lyapunov_spectrum ${SYSTEM_PLUGIN_TARGETS})
add_test(NAME test_lyapunov_spectrum COMMAND test_lyapunov_spectrum)

add_executable(test_dynamic_modes tests/test_dynamic_modes.cpp)
target_include_directories(test_dynamic_modes PRIVATE include)
target_link_libraries(test_dynamic_modes PRIVATE GTest::gtest_main slicer_core)
target_compile_definitions(test_dynamic_modes PRIVATE SLICER_SYSTEMS_DIR="${SLICER_SYSTEMS_DIR}")
add_dependencies(test_dynamic_modes ${SYSTEM_PLUGIN_TARGETS})
add_test(NAME test_dynamic_modes COMMAND test_dynamic_modes)

set(SLICER_PRESENTATION_DIR ${CMAKE_SOURCE_DIR}/../presentation/experiments)
if(EXISTS ${SLICER_PRESENTATION_DIR}/chialvo_survey.cpp)
  add_executable(chialvo_survey ${SLICER_PRESENTATION_DIR}/chialvo_survey.cpp)
  target_include_directories(chialvo_survey PRIVATE include)
  target_link_libraries(chialvo_survey PRIVATE slicer_core OpenMP::OpenMP_CXX)

  add_executable(read_grid ${SLICER_PRESENTATION_DIR}/read_grid.cpp)
  target_include_directories(read_grid PRIVATE include)
  target_link_libraries(read_grid PRIVATE slicer_core)

  add_executable(method_benchmark ${SLICER_PRESENTATION_DIR}/method_benchmark.cpp)
  target_include_directories(method_benchmark PRIVATE include)
  target_link_libraries(method_benchmark PRIVATE slicer_core OpenMP::OpenMP_CXX)
endif()

add_executable(test_bifurcation tests/test_bifurcation.cpp)
target_link_libraries(test_bifurcation PRIVATE GTest::gtest_main slicer_core)
add_test(NAME test_bifurcation COMMAND test_bifurcation)
