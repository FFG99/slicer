#include <gtest/gtest.h>

#include <filesystem>

#include "slicer/artifact/ArtifactFile.hpp"
#include "slicer/calculations/LyapunovSpectrum.hpp"
#include "slicer/calculations/LyapunovSpectrumParams.hpp"

#ifndef SLICER_SYSTEMS_DIR
#error "SLICER_SYSTEMS_DIR must be defined"
#endif

namespace fs = std::filesystem;

TEST(LyapunovSpectrumTest, SmallGridProducesFloatArtifact) {
  const fs::path path =
      fs::temp_directory_path() / "slicer_test_lyapunov_spectrum.h5";

  slicer::LyapunovSpectrumParams params;
  params.first_param = "a";
  params.second_param = "b";
  params.first_param_min = 1.2;
  params.first_param_max = 1.3;
  params.second_param_min = 0.25;
  params.second_param_max = 0.35;
  params.steps = 4;
  params.starting_point = {0.1, 0.1};
  params.num_iter_transient = 10;
  params.num_iter_attractor = 20;

  nlohmann::json job_params = {
      {"first_param", params.first_param},
      {"second_param", params.second_param},
      {"first_param_min", params.first_param_min},
      {"first_param_max", params.first_param_max},
      {"second_param_min", params.second_param_min},
      {"second_param_max", params.second_param_max},
      {"steps", params.steps},
      {"starting_point", params.starting_point},
      {"num_iter_transient", params.num_iter_transient},
      {"num_iter_attractor", params.num_iter_attractor},
  };

  auto artifact = slicer::ArtifactFile::create(path.string(), "lyapunov_spectrum", "henon",
                                               job_params);

  slicer::LyapunovSpectrumCalculator calculator(params, "henon", SLICER_SYSTEMS_DIR);
  calculator.run(artifact);

  const slicer::ArtifactFile read_back(path.string());
  EXPECT_EQ(read_back.grid_rows(), 4U);
  EXPECT_EQ(read_back.grid_cols(), 4U);
  EXPECT_TRUE(read_back.grid_is_float());
  EXPECT_EQ(read_back.read_frame().space, "parameter_plane");

  fs::remove(path);
}
