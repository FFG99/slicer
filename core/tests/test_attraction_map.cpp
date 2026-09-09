#include <gtest/gtest.h>

#include <filesystem>
#include <string>

#include "slicer/artifact/ArtifactFile.hpp"
#include "slicer/calculations/AttractionMap.hpp"
#include "slicer/calculations/AttractionMapParams.hpp"

#ifndef SLICER_SYSTEMS_DIR
#error "SLICER_SYSTEMS_DIR must be defined"
#endif

namespace fs = std::filesystem;

TEST(AttractionMapTest, SmallGridProducesArtifact) {
  const fs::path path =
      fs::temp_directory_path() / "slicer_test_attraction_map.h5";

  slicer::AttractionMapParams params;
  params.first_param = "a";
  params.second_param = "b";
  params.first_param_min = 1.2;
  params.first_param_max = 1.3;
  params.second_param_min = 0.25;
  params.second_param_max = 0.35;
  params.steps = 4;

  params.first_var = "x";
  params.second_var = "y";
  params.first_var_min = -0.2;
  params.first_var_max = 0.2;
  params.second_var_min = -0.2;
  params.second_var_max = 0.2;
  params.var_steps = 4;

  params.starting_point = {0.1, 0.1};
  params.num_iter_transient = 20;
  params.num_iter_attractor = 40;

  nlohmann::json job_params = {
      {"first_param", params.first_param},
      {"second_param", params.second_param},
      {"first_param_min", params.first_param_min},
      {"first_param_max", params.first_param_max},
      {"second_param_min", params.second_param_min},
      {"second_param_max", params.second_param_max},
      {"steps", params.steps},
      {"first_var", params.first_var},
      {"second_var", params.second_var},
      {"first_var_min", params.first_var_min},
      {"first_var_max", params.first_var_max},
      {"second_var_min", params.second_var_min},
      {"second_var_max", params.second_var_max},
      {"var_steps", params.var_steps},
      {"starting_point", params.starting_point},
      {"num_iter_transient", params.num_iter_transient},
      {"num_iter_attractor", params.num_iter_attractor},
  };

  auto artifact = slicer::ArtifactFile::create(
      path.string(), "attraction_map", "henon", job_params);

  slicer::AttractionMapCalculator calculator(params, "henon", SLICER_SYSTEMS_DIR);
  calculator.run(artifact);

  const slicer::ArtifactFile read_back(path.string());
  EXPECT_EQ(read_back.grid_rows(), 4U);
  EXPECT_EQ(read_back.grid_cols(), 4U);
  EXPECT_EQ(read_back.read_frame().space, "parameter_plane");

  const auto row = read_back.read_main_grid_row(0);
  EXPECT_EQ(row.size(), 4U);

  fs::remove(path);
}
