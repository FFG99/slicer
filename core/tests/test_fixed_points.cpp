#include <gtest/gtest.h>
#include <algorithm>
#include <cmath>
#include <filesystem>
#include <functional>
#include <numbers>
#include "slicer/calculations/FixedPoints.hpp"
#include "slicer/artifact/ArtifactFile.hpp"

namespace {
using J = nlohmann::json;
class Map : public slicer::SystemBase {
 public:
  int dimension = 1;
  std::function<std::vector<double>(const std::vector<double>&, double)> f;
  std::vector<double> evaluate(const std::vector<double>& x, const std::vector<double>& p) override { return f(x, p[0]); }
  std::string get_name() const override { return "test"; }
  std::vector<std::string> get_parameter_names() const override { return {"p"}; }
  std::vector<std::string> get_variable_names() const override { return dimension == 1 ? std::vector<std::string>{"x"} : std::vector<std::string>{"x", "y"}; }
};
J settings(int dimension = 1) {
  return {{"parameter", "p"}, {"model_parameters", {{"p", 2.}}}, {"parameter_min", 2.}, {"parameter_max", 4.},
          {"state_min", std::vector<double>(dimension, -2.)}, {"state_max", std::vector<double>(dimension, 2.)},
          {"steps", 3}, {"seeds_per_axis", 9}, {"max_iterations", 80}};
}
Map logistic() {
  Map m;
  m.f = [](const auto& x, double p) { return std::vector<double>{p * x[0] * (1 - x[0])}; };
  return m;
}
}

TEST(FixedPoints, LogisticFindsUnstableAndStableRootsAndFlipCondition) {
  auto m = logistic(); auto p = settings();
  auto result = slicer::fixed_point_diagram(m, p);
  ASSERT_EQ(result["samples"].size(), 3);
  for (int i = 0; i < 3; ++i) {
    auto roots = result["samples"][i]["points"];
    ASSERT_EQ(roots.size(), 2) << roots;
    double parameter = i + 2.;
    for (const auto& root : roots) {
      double x = root["state"][0];
      EXPECT_LT(root["residual"].get<double>(), 1e-10);
      if (std::abs(x) < 1e-8) {
        EXPECT_NEAR(root["multipliers"][0][0].get<double>(), parameter, 1e-7);
        EXPECT_EQ(root["stability"], "repeller");
        EXPECT_EQ(root["type"], "repelling");
      } else {
        EXPECT_NEAR(x, 1 - 1 / parameter, 1e-8);
        EXPECT_NEAR(root["multipliers"][0][0].get<double>(), 2 - parameter, 1e-7);
        EXPECT_EQ(root["stability"], i == 0 ? "stable" : i == 1 ? "nonhyperbolic" : "repeller");
        EXPECT_EQ(root["type"], i == 0 ? "attracting" : i == 1 ? "nonhyperbolic" : "repelling");
        if (i == 1) EXPECT_EQ(root["conditions"], J::array({"mu_minus_one"}));
      }
    }
  }
}

TEST(FixedPoints, HenonFindsBothAnalyticFixedPointsAndSaddles) {
  Map m; m.dimension = 2;
  m.f = [](const auto& x, double p) { return std::vector<double>{1 - p * x[0] * x[0] + x[1], .3 * x[0]}; };
  auto p = settings(2); p["parameter_min"] = 1.2; p["parameter_max"] = 1.4;
  auto result = slicer::fixed_point_diagram(m, p);
  for (auto sample : result["samples"]) {
    double a = sample["parameter"];
    ASSERT_EQ(sample["points"].size(), 2) << sample;
    for (auto point : sample["points"]) {
      double x = point["state"][0], y = point["state"][1];
      double expected = (-.7 + std::copysign(std::sqrt(.49 + 4 * a), x)) / (2 * a);
      EXPECT_NEAR(x, expected, 1e-9); EXPECT_NEAR(y, .3 * x, 1e-9);
      EXPECT_EQ(point["stability"], "saddle");
      EXPECT_EQ(point["unstable_dimension"], 1);
      double mu1 = point["multipliers"][0][0], mu2 = point["multipliers"][1][0];
      EXPECT_NEAR(mu1 + mu2, -2 * a * x, 1e-7); EXPECT_NEAR(mu1 * mu2, -.3, 1e-7);
    }
  }
}

TEST(FixedPoints, RotatingMapClassifiesFocusAndUnitComplexPair) {
  Map m; m.dimension = 2;
  m.f = [](const auto& x, double p) { return std::vector<double>{-p * x[1], p * x[0]}; };
  auto p = settings(2); p["parameter_min"] = .5; p["parameter_max"] = 1.5;
  auto result = slicer::fixed_point_diagram(m, p);
  for (int i = 0; i < 3; ++i) {
    const auto roots = result["samples"][i]["points"];
    ASSERT_EQ(roots.size(), 1);
    EXPECT_EQ(roots[0]["type"], i == 0 ? "stable_focus" : i == 1 ? "nonhyperbolic" : "repeller_focus");
    EXPECT_NEAR(roots[0]["multipliers"][0][1].get<double>(), .5 * (i + 1), 1e-8);
    if (i == 1) EXPECT_EQ(roots[0]["conditions"], J::array({"unit_complex_pair"}));
  }
}

TEST(FixedPoints, SaddleNodeHasNoSpuriousRootsOnEmptySide) {
  Map m;
  m.f = [](const auto& x, double p) { return std::vector<double>{x[0] + p - x[0] * x[0]}; };
  auto p = settings(); p["parameter_min"] = -.25; p["parameter_max"] = .25;
  auto result = slicer::fixed_point_diagram(m, p);
  EXPECT_TRUE(result["samples"][0]["points"].empty());
  ASSERT_GE(result["samples"][1]["points"].size(), 1);
  EXPECT_EQ(result["samples"][1]["points"][0]["stability"], "nonhyperbolic");
  EXPECT_EQ(result["samples"][2]["points"].size(), 2);
}

TEST(FixedPoints, FocusTypeDoesNotDependOnUnitCircleTolerance) {
  Map m; m.dimension = 2;
  m.f = [](const auto& x, double p) { return std::vector<double>{p * x[0] - 1e-7 * x[1], 1e-7 * x[0] + p * x[1]}; };
  auto p = settings(2); p["parameter_min"] = .4; p["parameter_max"] = .6;
  auto result = slicer::fixed_point_diagram(m, p);
  for (auto sample : result["samples"]) {
    ASSERT_EQ(sample["points"].size(), 1);
    EXPECT_EQ(sample["points"][0]["type"], "stable_focus");
    EXPECT_TRUE(sample["points"][0]["conditions"].empty());
  }
}

TEST(FixedPoints, RejectsNonconvergenceNonfiniteMapsAndOutOfBoundsRoots) {
  Map m; m.f = [](const auto& x, double) { return std::vector<double>{x[0] + 1}; };
  auto result = slicer::fixed_point_diagram(m, settings());
  for (auto sample : result["samples"]) EXPECT_TRUE(sample["points"].empty());
  m.f = [](const auto&, double) { return std::vector<double>{NAN}; };
  result = slicer::fixed_point_diagram(m, settings());
  for (auto sample : result["samples"]) { EXPECT_TRUE(sample["points"].empty()); EXPECT_GT(sample["failed_attempts"], 0); }
  m.f = [](const auto&, double) { return std::vector<double>{3.}; };
  result = slicer::fixed_point_diagram(m, settings());
  for (auto sample : result["samples"]) EXPECT_TRUE(sample["points"].empty());
}

TEST(FixedPoints, DampingConvergesWhenFullNewtonStepIncreasesResidual) {
  Map m; m.f = [](const auto& x, double) { return std::vector<double>{x[0] + x[0] * x[0] * x[0] - 1}; };
  auto result = slicer::fixed_point_diagram(m, settings());
  for (auto sample : result["samples"]) {
    ASSERT_EQ(sample["points"].size(), 1);
    EXPECT_NEAR(sample["points"][0]["state"][0].get<double>(), 1., 1e-9);
  }
}

TEST(FixedPoints, ValidatesDimensionSettingsAndWorkLimit) {
  auto m = logistic(); auto p = settings();
  p["state_min"] = {-2., -2.}; EXPECT_THROW(slicer::fixed_point_diagram(m, p), std::invalid_argument);
  p = settings(); p["steps"] = 1; EXPECT_THROW(slicer::fixed_point_diagram(m, p), std::invalid_argument);
  p = settings(); p["tolerance"] = NAN; EXPECT_THROW(slicer::fixed_point_diagram(m, p), std::invalid_argument);
  p = settings(); p["steps"] = 1000; p["max_iterations"] = 100; EXPECT_THROW(slicer::fixed_point_diagram(m, p), std::invalid_argument);
  m.dimension = 3; EXPECT_THROW(slicer::fixed_point_diagram(m, settings()), std::invalid_argument);
}

TEST(FixedPoints, PersistsJsonInHdf5) {
  auto path = std::filesystem::temp_directory_path() / "slicer-test-fixed-points.h5";
  auto m = logistic(); auto p = settings(); auto result = slicer::fixed_point_diagram(m, p);
  {
    auto artifact = slicer::ArtifactFile::create(path.string(), "fixed_point_diagram", "test", p);
    artifact.write_fixed_points(result); artifact.mark_finished();
  }
  {
    H5::H5File file(path.string(), H5F_ACC_RDONLY);
    auto dataset = file.openDataSet("/artifacts/main/fixed_points_json");
    std::string raw; dataset.read(raw, dataset.getStrType());
    EXPECT_EQ(J::parse(raw), result);
  }
  std::filesystem::remove(path);
}

TEST(FixedPoints, InterpolatesFullSegmentAndRecordsActualParameterSets) {
  class SegmentMap : public Map {
   public:
    std::vector<std::string> get_parameter_names() const override { return {"a", "b"}; }
    std::vector<double> evaluate(const std::vector<double>& x, const std::vector<double>& p) override {
      return {.5 * x[0] + p[0], .25 * x[1] + p[1]};
    }
  } m;
  m.dimension = 2;
  auto p = settings(2);
  p.erase("model_parameters"); p.erase("parameter"); p.erase("parameter_min"); p.erase("parameter_max");
  p["start"] = {{"a", .5}, {"b", -.75}}; p["end"] = {{"a", -.5}, {"b", .75}};
  auto result = slicer::fixed_point_diagram(m, p);
  EXPECT_EQ(result["parameter"], "t");
  for (int i = 0; i < 3; ++i) {
    const auto sample = result["samples"][i];
    EXPECT_EQ(sample["t"], i * .5);
    EXPECT_EQ(sample["parameter"], i * .5);
    ASSERT_EQ(sample["points"].size(), 1);
    EXPECT_NEAR(sample["points"][0]["state"][0].get<double>(), 1 - i, 1e-9);
    EXPECT_NEAR(sample["points"][0]["state"][1].get<double>(), i - 1, 1e-9);
    EXPECT_NEAR(sample["model_parameters"]["a"].get<double>(), .5 - .5 * i, 1e-12);
    EXPECT_NEAR(sample["model_parameters"]["b"].get<double>(), -.75 + .75 * i, 1e-12);
  }
  p["end"]["b"] = -.75;
  result = slicer::fixed_point_diagram(m, p);
  EXPECT_EQ(result["parameter"], "a");
  EXPECT_EQ(result["samples"][0]["parameter"], .5);
  EXPECT_EQ(result["samples"][2]["parameter"], -.5);
  p["end"] = p["start"];
  EXPECT_THROW(slicer::fixed_point_diagram(m, p), std::invalid_argument);
}

TEST(FixedPoints, ScalarIsolationRecoversCubicMiddleBranchInReportedSweep) {
  Map m;
  m.f = [](const auto& x, double b) { return std::vector<double>{1.1 + b * x[0] - x[0] * x[0] * x[0]}; };
  auto p = settings();
  p["parameter_min"] = -5.; p["parameter_max"] = 10.; p["steps"] = 400;
  p["state_min"] = {-20.}; p["state_max"] = {20.}; p["max_iterations"] = 50; p["tolerance"] = 1e-6;
  for (int seeds : {2, 20}) {
    p["seeds_per_axis"] = seeds;
    auto result = slicer::fixed_point_diagram(m, p);
    EXPECT_EQ(result["method"], "bracketed_and_multistart_newton");
    size_t total = 0;
    for (const auto& sample : result["samples"]) {
      const double b = sample["parameter"], q = (b - 1) / 3;
      const double discriminant = .55 * .55 - q * q * q;
      std::vector<double> expected;
      if (discriminant > 0) {
        double d = std::sqrt(discriminant);
        expected.push_back(std::cbrt(.55 + d) + std::cbrt(.55 - d));
      } else {
        double angle = std::acos(.55 / std::pow(q, 1.5));
        for (int k = 0; k < 3; ++k) expected.push_back(2 * std::sqrt(q) * std::cos((angle + 2 * std::numbers::pi * k) / 3));
      }
      ASSERT_EQ(sample["points"].size(), expected.size()) << "b=" << b << ", seeds=" << seeds << ": " << sample;
      std::sort(expected.begin(), expected.end());
      std::vector<double> actual;
      for (const auto& point : sample["points"]) {
        double x = point["state"][0], multiplier = b - 3 * x * x;
        actual.push_back(x);
        EXPECT_NEAR(point["multipliers"][0][0].get<double>(), multiplier, 1e-6);
        EXPECT_EQ(point["type"], std::abs(multiplier) < 1 ? "attracting" : "repelling");
        EXPECT_LE(point["residual"].get<double>(), 1e-6);
      }
      std::sort(actual.begin(), actual.end());
      for (size_t i = 0; i < expected.size(); ++i) EXPECT_NEAR(actual[i], expected[i], 1e-6);
      total += actual.size();
    }
    EXPECT_EQ(total, 772);
  }
}

TEST(FixedPoints, ScalarSignChangeAtPoleDoesNotBecomeAFixedPoint) {
  Map m;
  m.f = [](const auto& x, double) { return std::vector<double>{x[0] + 1 / (x[0] - .123)}; };
  auto result = slicer::fixed_point_diagram(m, settings());
  for (const auto& sample : result["samples"]) EXPECT_TRUE(sample["points"].empty());
}
