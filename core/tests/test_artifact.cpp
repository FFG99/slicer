#include <gtest/gtest.h>

#include <filesystem>
#include <string>

#include "slicer/artifact/ArtifactFile.hpp"
#include "slicer/calculations/AttractionMapParams.hpp"

namespace fs = std::filesystem;

TEST(ArtifactFileTest, WriteAndReadGrid) {
  const fs::path path =
      fs::temp_directory_path() / "slicer_test_artifact.h5";

  nlohmann::json parameters = {
      {"first_param", "a"},
      {"steps", 4},
  };

  {
    auto artifact = slicer::ArtifactFile::create(
        path.string(), "attraction_map", "henon", parameters);

    slicer::CoordinateFrame frame;
    frame.system = "henon";
    frame.space = "parameter_plane";
    frame.axes = {
        slicer::Axis{"a", "sweep", std::nullopt, 1.0, 1.5, 4},
        slicer::Axis{"b", "sweep", std::nullopt, 0.2, 0.4, 4},
    };
    artifact.write_frame(frame);
    artifact.create_main_grid(4, 4);

    for (size_t row = 0; row < 4; ++row) {
      artifact.write_main_grid_row(row, {row, row + 1, row + 2, row + 3});
    }
    artifact.mark_finished();
  }

  const slicer::ArtifactFile artifact(path.string());
  EXPECT_EQ(artifact.calculation_type(), "attraction_map");
  EXPECT_EQ(artifact.system(), "henon");
  EXPECT_EQ(artifact.grid_rows(), 4U);
  EXPECT_EQ(artifact.grid_cols(), 4U);

  const auto frame = artifact.read_frame();
  EXPECT_EQ(frame.system, "henon");
  EXPECT_EQ(frame.space, "parameter_plane");
  EXPECT_EQ(frame.axes.size(), 2U);
  EXPECT_EQ(artifact.read_main_grid_row(2), (std::vector<std::size_t>{2, 3, 4, 5}));

  fs::remove(path);
}
