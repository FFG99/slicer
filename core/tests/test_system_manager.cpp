#include <gtest/gtest.h>

#include <algorithm>
#include <string>
#include <limits>

#include "slicer/systems/SystemManager.hpp"

#ifndef SLICER_SYSTEMS_DIR
#error "SLICER_SYSTEMS_DIR must be defined"
#endif

class SystemManagerTest : public ::testing::Test {
 protected:
  slicer::SystemManager* manager = &slicer::SystemManager::instance();
};

TEST_F(SystemManagerTest, LoadSystems) {
  ASSERT_NO_THROW(manager->load_systems(SLICER_SYSTEMS_DIR));
  const auto names = manager->get_system_names();
  ASSERT_GE(names.size(), 3U);
  EXPECT_NE(std::find(names.begin(), names.end(), "henon"), names.end());
  EXPECT_NE(std::find(names.begin(), names.end(), "chialvo"), names.end());
  EXPECT_NE(std::find(names.begin(), names.end(), "universal2d"), names.end());
}

TEST_F(SystemManagerTest, CreateSystem) {
  manager->load_systems(SLICER_SYSTEMS_DIR);
  auto system = manager->create_system("henon");
  ASSERT_NE(system, nullptr);
  EXPECT_EQ(system->get_parameter_names().size(), 2U);
  EXPECT_EQ(system->get_variable_names().size(), 2U);
}

TEST_F(SystemManagerTest, InvalidSystemName) {
  manager->load_systems(SLICER_SYSTEMS_DIR);
  EXPECT_THROW(manager->create_system("missing"), std::runtime_error);
}

TEST_F(SystemManagerTest, EvaluateHenon) {
  manager->load_systems(SLICER_SYSTEMS_DIR);
  auto system = manager->create_system("henon");
  const auto result = system->evaluate({0.0, 0.0}, {1.4, 0.3});
  ASSERT_EQ(result.size(), 2U);
  EXPECT_NEAR(result[0], 1.0, 1e-10);
  EXPECT_NEAR(result[1], 0.0, 1e-10);
}

namespace {
class Linear1D : public slicer::SystemBase {
 public:
  bool wrong_result = false;
  size_t calls = 0;
  std::vector<double> evaluate(const std::vector<double>& state,
                               const std::vector<double>&) override {
    ++calls;
    if (wrong_result) return {state[0], 0.0};
    return {0.5 * state[0]};
  }
  std::string get_name() const override { return "linear1d"; }
  std::vector<std::string> get_variable_names() const override { return {"x"}; }
  std::vector<std::string> get_parameter_names() const override { return {}; }
};
}

TEST(BoundedSystemTest, OneDimensionalStateAndDimensionDiagnostics) {
  auto plugin = std::make_unique<Linear1D>();
  auto* raw = plugin.get();
  slicer::BoundedSystem system(std::move(plugin), 100.0);
  EXPECT_EQ(system.evaluate({0.4}, {}), (std::vector<double>{0.2}));
  for (const auto& point : {std::vector<double>{0.4, 0.0},
                            std::vector<double>{std::numeric_limits<double>::infinity(), 0.0}}) {
    try {
      system.evaluate(point, {});
      FAIL() << "Invalid input dimension was accepted";
    } catch (const std::invalid_argument& error) {
      EXPECT_NE(std::string(error.what()).find("expected 1, got 2"), std::string::npos);
    }
  }
  EXPECT_EQ(raw->calls, 1U);
  raw->wrong_result = true;
  try {
    system.evaluate({0.4}, {});
    FAIL() << "Invalid output dimension was accepted";
  } catch (const std::runtime_error& error) {
    EXPECT_NE(std::string(error.what()).find("expected 1, got 2"), std::string::npos);
  }
}
