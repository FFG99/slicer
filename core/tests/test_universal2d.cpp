#include <gtest/gtest.h>

#include <cmath>
#include <memory>
#include <vector>

#include "slicer/systems/SystemBase.hpp"

class Universal2DMap : public slicer::SystemBase {
 public:
  std::vector<double> evaluate(const std::vector<double>& variables,
                               const std::vector<double>& parameters) override {
    const double S = parameters[0];
    const double J = parameters[1];
    const double x = variables[0];
    const double y = variables[1];
    const double r_sq = x * x + y * y;
    return {S * x - y - r_sq, J * x - r_sq / 5.0};
  }

  std::vector<std::string> get_variable_names() const override { return {"x", "y"}; }

  std::vector<std::string> get_parameter_names() const override { return {"S", "J"}; }

  std::string get_name() const override { return "universal2d"; }
};

class Universal2DSystemTest : public ::testing::Test {
 protected:
  void SetUp() override { system = std::make_unique<Universal2DMap>(); }

  std::unique_ptr<Universal2DMap> system;
};

TEST_F(Universal2DSystemTest, BasicEvaluation) {
  const std::vector<double> variables = {1.0, 0.0};
  const std::vector<double> parameters = {1.0, 0.5};  // S, J

  const auto result = system->evaluate(variables, parameters);

  // r_sq = 1; x' = S*x - y - r_sq = 0; y' = J*x - r_sq/5 = 0.5 - 0.2 = 0.3
  EXPECT_EQ(result.size(), 2U);
  EXPECT_NEAR(result[0], 0.0, 1e-10);
  EXPECT_NEAR(result[1], 0.3, 1e-10);
}

TEST_F(Universal2DSystemTest, Names) {
  EXPECT_EQ(system->get_name(), "universal2d");
  EXPECT_EQ(system->get_parameter_names().size(), 2U);
}
