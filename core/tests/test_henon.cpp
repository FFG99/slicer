#include <gtest/gtest.h>

#include <cmath>
#include <memory>
#include <vector>

#include "slicer/systems/SystemBase.hpp"

class HenonMap : public slicer::SystemBase {
 public:
  std::vector<double> evaluate(const std::vector<double>& variables,
                               const std::vector<double>& parameters) override {
    const double a = parameters[0];
    const double b = parameters[1];
    const double x = variables[0];
    const double y = variables[1];
    return {1.0 - a * x * x + y, b * x};
  }

  std::vector<std::string> get_variable_names() const override { return {"x", "y"}; }

  std::vector<std::string> get_parameter_names() const override { return {"a", "b"}; }

  std::string get_name() const override { return "henon"; }
};

class HenonSystemTest : public ::testing::Test {
 protected:
  void SetUp() override { system = std::make_unique<HenonMap>(); }

  std::unique_ptr<HenonMap> system;
};

TEST_F(HenonSystemTest, BasicEvaluation) {
  const std::vector<double> variables = {0.0, 0.0};
  const std::vector<double> parameters = {1.4, 0.3};

  const auto result = system->evaluate(variables, parameters);

  EXPECT_EQ(result.size(), 2U);
  EXPECT_NEAR(result[0], 1.0, 1e-10);
  EXPECT_NEAR(result[1], 0.0, 1e-10);
}

TEST_F(HenonSystemTest, Names) {
  const auto param_names = system->get_parameter_names();
  const auto var_names = system->get_variable_names();

  ASSERT_EQ(param_names.size(), 2U);
  ASSERT_EQ(var_names.size(), 2U);
  EXPECT_EQ(param_names[0], "a");
  EXPECT_EQ(param_names[1], "b");
  EXPECT_EQ(var_names[0], "x");
  EXPECT_EQ(var_names[1], "y");
}
