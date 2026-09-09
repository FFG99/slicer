#include <gtest/gtest.h>

#include <filesystem>
#include <string>

#include "slicer/artifact/ArtifactFile.hpp"
#include "slicer/calculations/PoolOfAttraction.hpp"
#include "slicer/calculations/PoolOfAttractionParams.hpp"

#ifndef SLICER_SYSTEMS_DIR
#error "SLICER_SYSTEMS_DIR must be defined"
#endif

namespace fs = std::filesystem;

TEST(PoolOfAttractionTest, SmallGridProducesArtifact) {
  const fs::path path =
      fs::temp_directory_path() / "slicer_test_pool_of_attraction.h5";

  slicer::PoolOfAttractionParams params;
  params.first_var = "x";
  params.second_var = "y";
  params.first_var_min = -0.2;
  params.first_var_max = 0.2;
  params.second_var_min = -0.2;
  params.second_var_max = 0.2;
  params.steps = 4;
  params.parameters = {{"a", 1.25}, {"b", 0.3}};
  params.starting_point = {0.1, 0.1};
  params.num_iter_transient = 20;
  params.num_iter_attractor = 40;

  nlohmann::json job_params = {
      {"first_var", params.first_var},
      {"second_var", params.second_var},
      {"first_var_min", params.first_var_min},
      {"first_var_max", params.first_var_max},
      {"second_var_min", params.second_var_min},
      {"second_var_max", params.second_var_max},
      {"steps", params.steps},
      {"parameters", params.parameters},
      {"starting_point", params.starting_point},
      {"num_iter_transient", params.num_iter_transient},
      {"num_iter_attractor", params.num_iter_attractor},
  };

  auto artifact = slicer::ArtifactFile::create(path.string(), "pool_of_attraction", "henon",
                                               job_params);

  slicer::PoolOfAttractionCalculator calculator(params, "henon", SLICER_SYSTEMS_DIR);
  calculator.run(artifact);

  const slicer::ArtifactFile read_back(path.string());
  EXPECT_EQ(read_back.grid_rows(), 4U);
  EXPECT_EQ(read_back.grid_cols(), 4U);
  EXPECT_EQ(read_back.read_frame().space, "ic_plane");

  fs::remove(path);
}
