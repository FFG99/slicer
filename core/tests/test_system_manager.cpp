#include <gtest/gtest.h>

#include <algorithm>
#include <string>

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
