#include <gtest/gtest.h>

#include <filesystem>
#include <string>

#include "slicer/artifact/ArtifactFile.hpp"
#include "slicer/calculations/Integrate.hpp"
#include "slicer/calculations/IntegrateParams.hpp"

#ifndef SLICER_SYSTEMS_DIR
#error "SLICER_SYSTEMS_DIR must be defined"
#endif

namespace fs = std::filesystem;

TEST(IntegrateTest, WriteAndReadTrajectory) {
  const fs::path path = fs::temp_directory_path() / "slicer_test_integrate.h5";

  nlohmann::json parameters = {
      {"parameters", {{"a", 1.25}, {"b", 0.3}}},
      {"initial_conditions", {0.1, 0.1}},
      {"num_iter_transient", 2},
      {"num_iter_attractor", 3},
      {"output_mode", "phase_plane"},
  };

  {
    auto artifact = slicer::ArtifactFile::create(path.string(), "phase_portrait", "henon",
                                                 parameters);
    const auto params = slicer::parse_integrate_params(parameters);
    const auto frame = slicer::build_integrate_frame(
        params, "henon", {"x", "y"}, 3.0, 5.0, {-1.0, -1.0}, {1.0, 1.0});
    artifact.write_frame(frame);
    artifact.create_trajectory(3, 2);
    artifact.write_trajectory({0.1, 0.1, 0.2, 0.2, 0.3, 0.3}, {3.0, 4.0, 5.0});
    artifact.mark_finished();
  }

  const slicer::ArtifactFile artifact(path.string());
  EXPECT_EQ(artifact.calculation_type(), "phase_portrait");
  EXPECT_TRUE(artifact.has_trajectory());
  EXPECT_FALSE(artifact.has_grid());
  EXPECT_EQ(artifact.trajectory_points(), 3U);
  EXPECT_EQ(artifact.trajectory_dim(), 2U);

  const auto frame = artifact.read_frame();
  EXPECT_EQ(frame.space, "phase_plane");

  fs::remove(path);
}

TEST(IntegrateTest, PhasePortraitSkipsTransientIterations) {
  const fs::path path = fs::temp_directory_path() / "slicer_test_integrate_phase.h5";

  nlohmann::json parameters = {
      {"parameters", {{"a", 1.25}, {"b", 0.3}}},
      {"initial_conditions", {0.1, 0.1}},
      {"num_iter_transient", 5},
      {"num_iter_attractor", 4},
      {"output_mode", "phase_plane"},
  };

  {
    const auto params = slicer::parse_integrate_params(parameters);
    slicer::IntegrateCalculator calculator(params, "henon", SLICER_SYSTEMS_DIR);
    auto artifact = slicer::ArtifactFile::create(path.string(), "phase_portrait", "henon",
                                                 parameters);
    calculator.run(artifact);
  }

  const slicer::ArtifactFile artifact(path.string());
  EXPECT_EQ(artifact.trajectory_points(), 4U);

  fs::remove(path);
}

TEST(IntegrateTest, PhasePortraitFlagsDivergence) {
  const fs::path path = fs::temp_directory_path() / "slicer_test_integrate_div.h5";

  // Genuine escape: this Henon initial condition grows without bound and
  // overflows to a non-finite state (not a recoverable transient overshoot).
  nlohmann::json parameters = {
      {"parameters", {{"a", 1.25}, {"b", 0.3}}},
      {"initial_conditions", {1.0e8, 1.0e8}},
      {"num_iter_transient", 30},
      {"num_iter_attractor", 5},
      {"output_mode", "phase_plane"},
  };

  {
    const auto params = slicer::parse_integrate_params(parameters);
    slicer::IntegrateCalculator calculator(params, "henon", SLICER_SYSTEMS_DIR);
    auto artifact = slicer::ArtifactFile::create(path.string(), "phase_portrait", "henon",
                                                 parameters);
    calculator.run(artifact);
  }

  const slicer::ArtifactFile artifact(path.string());
  const auto frame = artifact.read_frame();
  EXPECT_TRUE(frame.diverged.has_value());
  EXPECT_TRUE(frame.diverged.value_or(false));
  // The orbit escaped during the transient, so no attractor points were stored.
  EXPECT_LT(artifact.trajectory_points(), 5U);

  fs::remove(path);
}

TEST(IntegrateTest, PhasePortraitTransientOvershootIsNotDivergence) {
  const fs::path path = fs::temp_directory_path() / "slicer_test_integrate_overshoot.h5";

  // Chialvo from a far initial condition spikes to ~1e16 on the first transient
  // step, then settles onto a bounded attractor. This must NOT be flagged as
  // divergence (regression: it previously truncated the whole trajectory).
  nlohmann::json parameters = {
      {"parameters", {{"a", 0.2}, {"b", 0.6}, {"c", 2.1368}, {"I", 0.0967}}},
      {"initial_conditions", {-18.0, 15.0}},
      {"num_iter_transient", 1000},
      {"num_iter_attractor", 100},
      {"output_mode", "phase_plane"},
  };

  {
    const auto params = slicer::parse_integrate_params(parameters);
    slicer::IntegrateCalculator calculator(params, "chialvo", SLICER_SYSTEMS_DIR);
    auto artifact = slicer::ArtifactFile::create(path.string(), "phase_portrait", "chialvo",
                                                 parameters);
    calculator.run(artifact);
  }

  const slicer::ArtifactFile artifact(path.string());
  const auto frame = artifact.read_frame();
  EXPECT_FALSE(frame.diverged.value_or(false));
  EXPECT_EQ(artifact.trajectory_points(), 100U);

  fs::remove(path);
}
