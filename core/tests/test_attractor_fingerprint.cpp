#include <gtest/gtest.h>

#include <cmath>
#include <cstddef>
#include <vector>

#include "slicer/calculations/AttractorFingerprint.hpp"

namespace {

/** Converged samples know their position to near machine precision. */
constexpr double kTightScale = 1e-9;

slicer::AttractorFingerprint make_cloud(std::vector<std::vector<double>> points, double scale,
                                        size_t period = 5000) {
  slicer::AttractorFingerprint fingerprint;
  fingerprint.period = period;
  fingerprint.periodic = period < 5000;
  fingerprint.points = std::move(points);
  fingerprint.scale = scale;
  return fingerprint;
}

/** Regular grid over [x0,x1]x[y0,y1], optionally keeping only a column band. */
std::vector<std::vector<double>> grid_cloud(double x0, double x1, double y0, double y1,
                                            size_t n, double keep_x_min = -1e18,
                                            double keep_x_max = 1e18) {
  std::vector<std::vector<double>> points;
  for (size_t i = 0; i < n; ++i) {
    const double y = y0 + (y1 - y0) * static_cast<double>(i) / static_cast<double>(n - 1);
    for (size_t j = 0; j < n; ++j) {
      const double x = x0 + (x1 - x0) * static_cast<double>(j) / static_cast<double>(n - 1);
      if (x >= keep_x_min && x <= keep_x_max) {
        points.push_back({x, y});
      }
    }
  }
  return points;
}

}  // namespace

TEST(AttractorFingerprintTest, IdenticalFixedPointsMatch) {
  const auto a = make_cloud({{1.0, 2.0}}, kTightScale, 1);
  const auto b = make_cloud({{1.0, 2.0}}, kTightScale, 1);
  EXPECT_TRUE(slicer::same_attractor(a, b));
}

TEST(AttractorFingerprintTest, ClassifiesFixedPeriodicAndNonPeriodicAttractors) {
  EXPECT_EQ(slicer::attractor_kind(make_cloud({{1.0, 2.0}}, kTightScale, 1)),
            slicer::AttractorKind::FixedPoint);
  EXPECT_EQ(slicer::attractor_kind(make_cloud({{0.0, 0.0}, {1.0, 1.0}}, kTightScale, 2)),
            slicer::AttractorKind::Periodic);
  EXPECT_EQ(slicer::attractor_kind(make_cloud(grid_cloud(0.0, 1.0, 0.0, 1.0, 3), 0.5)),
            slicer::AttractorKind::NonPeriodic);
}

TEST(AttractorFingerprintTest, DistinctConvergedFixedPointsAreSeparated) {
  // Both orbits have fully settled (tight scale): points 0.02 apart are two
  // genuinely different fixed points, however close.
  const auto a = make_cloud({{1.00, 1.00}}, kTightScale, 1);
  const auto b = make_cloud({{1.02, 0.99}}, kTightScale, 1);
  EXPECT_FALSE(slicer::same_attractor(a, b));
}

TEST(AttractorFingerprintTest, SlowlyConvergingEstimatesOfOneFixedPointMerge) {
  // The same two points, but each orbit still carries a residual convergence
  // gap of ~0.05: at this self-reported resolution they are indistinguishable
  // and must be one attractor. Tolerance comes from the data, not a knob.
  const auto a = make_cloud({{1.00, 1.00}}, 0.05, 1);
  const auto b = make_cloud({{1.02, 0.99}}, 0.05, 1);
  EXPECT_TRUE(slicer::same_attractor(a, b));
}

TEST(AttractorFingerprintTest, DistantFixedPointsAreSeparated) {
  const auto a = make_cloud({{1.0, 1.0}}, kTightScale, 1);
  const auto b = make_cloud({{5.0, 5.0}}, kTightScale, 1);
  EXPECT_FALSE(slicer::same_attractor(a, b));
}

TEST(AttractorFingerprintTest, SameCycleWithResidualConvergenceMatches) {
  const auto a = make_cloud({{-0.50, -0.20}, {0.80, 0.30}, {0.10, 0.90}}, 0.02, 3);
  const auto b = make_cloud({{-0.51, -0.19}, {0.79, 0.31}, {0.11, 0.89}}, 0.02, 3);
  EXPECT_TRUE(slicer::same_attractor(a, b));
}

TEST(AttractorFingerprintTest, DifferentCyclesAreSeparated) {
  // P4 covers P2, but P2 covers only half of P4: mutual coverage fails.
  const auto a = make_cloud({{0.0, 0.0}, {1.0, 1.0}}, kTightScale, 2);
  const auto b = make_cloud({{0.0, 0.0}, {1.0, 1.0}, {2.0, 2.0}, {3.0, 3.0}}, kTightScale, 4);
  EXPECT_FALSE(slicer::same_attractor(a, b));
}

TEST(AttractorFingerprintTest, SameChaoticSetSampledTwiceMatches) {
  // Two independent samples of the same region: offset grids emulate the
  // sampling jitter of a chaotic orbit observed from two different cells.
  // The offset (~0.017) is below the sampling density (~0.053), which the
  // scale reports, so the derived tolerance absorbs it.
  const double spacing = 1.0 / 19.0;
  const auto a = make_cloud(grid_cloud(0.0, 1.0, 0.0, 1.0, 20), spacing);
  const auto b = make_cloud(grid_cloud(0.013, 1.013, 0.017, 1.017, 20), spacing);
  EXPECT_TRUE(slicer::same_attractor(a, b));
}

TEST(AttractorFingerprintTest, DisjointChaoticSetsAreSeparated) {
  const double spacing = 1.0 / 9.0;
  const auto a = make_cloud(grid_cloud(0.0, 1.0, 0.0, 1.0, 10), spacing);
  const auto b = make_cloud(grid_cloud(2.0, 3.0, 2.0, 3.0, 10), spacing);
  EXPECT_FALSE(slicer::same_attractor(a, b));
}

TEST(AttractorFingerprintTest, CycleInsideChaoticCloudIsSeparated) {
  // The cloud covers the cycle, but the cycle never covers the cloud back:
  // mutual coverage keeps a settled cycle distinct from a chaotic set that
  // occupies the same region (e.g. the ghost of a UPO inside a saddle).
  const auto cycle =
      make_cloud({{0.2, 0.2}, {0.8, 0.8}, {0.2, 0.8}, {0.8, 0.2}}, kTightScale, 4);
  const auto cloud = make_cloud(grid_cloud(0.0, 1.0, 0.0, 1.0, 20), 1.0 / 19.0);
  EXPECT_FALSE(slicer::same_attractor(cycle, cloud));
  EXPECT_FALSE(slicer::same_attractor(cloud, cycle));
}

TEST(AttractorClassifierTest, AssignsStableLabelsPerAttractor) {
  slicer::AttractorClassifier classifier;
  const auto fixed_a = make_cloud({{1.0, 1.0}}, 0.05, 1);
  const auto fixed_a_again = make_cloud({{1.02, 0.99}}, 0.05, 1);
  const auto fixed_b = make_cloud({{5.0, 5.0}}, 0.05, 1);

  EXPECT_EQ(classifier.classify(fixed_a), 1u);
  EXPECT_EQ(classifier.classify(fixed_a_again), 1u);
  EXPECT_EQ(classifier.classify(fixed_b), 2u);
  EXPECT_EQ(classifier.class_count(), 2u);

  const auto labels = classifier.final_labels();
  ASSERT_EQ(labels.size(), 3u);
  EXPECT_EQ(labels[0], 0u);  // divergence stays 0
  EXPECT_EQ(labels[1], 1u);
  EXPECT_EQ(labels[2], 2u);

  const auto periods = classifier.final_periods();
  ASSERT_EQ(periods.size(), 2u);
  EXPECT_EQ(periods[0], 1u);
  EXPECT_EQ(periods[1], 1u);
}

TEST(AttractorClassifierTest, BridgingOrbitMergesUnderCoveringClasses) {
  // Two partial samples of one attractor (each missing the opposite side)
  // fail mutual coverage pairwise, but an orbit that saw the whole set
  // matches both and must merge them into one class.
  // Grid spacing 0.1, scale 0.125 => pair tolerance 0.25.
  const double scale = 0.125;
  slicer::AttractorClassifier classifier;

  const auto left = make_cloud(grid_cloud(0.0, 1.0, 0.0, 1.0, 11, -1e18, 0.65), scale);
  const auto right = make_cloud(grid_cloud(0.0, 1.0, 0.0, 1.0, 11, 0.35, 1e18), scale);
  const auto full = make_cloud(grid_cloud(0.0, 1.0, 0.0, 1.0, 11), scale);

  const size_t label_left = classifier.classify(left);
  const size_t label_right = classifier.classify(right);
  EXPECT_NE(label_left, label_right);
  EXPECT_EQ(classifier.class_count(), 2u);

  classifier.classify(full);
  EXPECT_EQ(classifier.class_count(), 1u);

  const auto labels = classifier.final_labels();
  EXPECT_EQ(labels[label_left], labels[label_right]);
  EXPECT_EQ(labels[label_left], 1u);
}

class ChialvoMap : public slicer::SystemBase {
 public:
  std::vector<double> evaluate(const std::vector<double>& variables,
                               const std::vector<double>& parameters) override {
    const double a = parameters[0];
    const double b = parameters[1];
    const double c = parameters[2];
    const double I = parameters[3];
    const double x = variables[0];
    const double y = variables[1];
    return {x * x * std::exp(y - x) + I, a * y - b * x + c};
  }

  std::vector<std::string> get_variable_names() const override { return {"x", "y"}; }

  std::vector<std::string> get_parameter_names() const override {
    return {"a", "b", "c", "I"};
  }

  std::string get_name() const override { return "chialvo"; }
};

size_t classify_chialvo_grid(const std::vector<double>& params, size_t attractor_iters,
                             size_t steps = 25) {
  ChialvoMap system;
  slicer::AttractorTraceConfig config;
  config.num_iter_transient = 50000;
  config.num_iter_attractor = attractor_iters;
  config.accuracy = 0.001;

  slicer::AttractorMatchParams match;
  slicer::AttractorClassifier classifier(match);
  const double lo = -2.0;
  const double hi = 2.0;
  const double dx = (hi - lo) / static_cast<double>(steps - 1);
  for (size_t iy = 0; iy < steps; ++iy) {
    for (size_t ix = 0; ix < steps; ++ix) {
      const auto trace = slicer::trace_attractor_fingerprint(
          system, {lo + static_cast<double>(ix) * dx, lo + static_cast<double>(iy) * dx}, params,
          config);
      if (trace.converged) {
        classifier.classify(trace.fingerprint);
      }
    }
  }
  classifier.consolidate();
  return classifier.class_count();
}

TEST(AttractorClassifierTest, ChialvoSingleAttractorStaysOneClassWithShortWindow) {
  const std::vector<double> params = {0.2, 0.6, 2.2165, 0.2489};
  EXPECT_EQ(classify_chialvo_grid(params, 1000), 1u);
}

TEST(AttractorClassifierTest, ChialvoMultistableCaseKeepsSeveralClasses) {
  const std::vector<double> params = {0.2, 0.6, 2.6917, 0.1191};
  const size_t classes = classify_chialvo_grid(params, 5000);
  EXPECT_GE(classes, 3u);
  EXPECT_LE(classes, 4u);
}

TEST(AttractorClassifierTest, ChialvoTightAccuracyLongWindowStaysOneClass) {
  const std::vector<double> params = {0.2, 0.6, 2.068179867508142, 0.2548094981402498};
  ChialvoMap system;
  slicer::AttractorTraceConfig config;
  config.num_iter_transient = 50000;
  config.num_iter_attractor = 50000;
  config.accuracy = 1e-6;

  slicer::AttractorMatchParams match;
  slicer::AttractorClassifier classifier(match);
  const double lo = -1.0;
  const double hi = 5.0;
  const size_t steps = 15;
  const double dx = (hi - lo) / static_cast<double>(steps - 1);
  for (size_t iy = 0; iy < steps; ++iy) {
    for (size_t ix = 0; ix < steps; ++ix) {
      const auto trace = slicer::trace_attractor_fingerprint(
          system, {lo + static_cast<double>(ix) * dx, lo + static_cast<double>(iy) * dx}, params,
          config);
      if (trace.converged) {
        classifier.classify(trace.fingerprint);
      }
    }
  }
  classifier.consolidate();
  EXPECT_EQ(classifier.class_count(), 1u);
}

TEST(AttractorClassifierTest, ChialvoLongPeriodCycleStaysOneClass) {
  const std::vector<double> params = {0.2, 0.6, 2.1459, 0.3366};
  EXPECT_EQ(classify_chialvo_grid(params, 5000, 25), 1u);
}

TEST(AttractorFingerprintTest, PeriodLabelReportsPeriod) {
  const auto cycle = make_cloud({{0.0, 0.0}, {1.0, 0.0}}, kTightScale, 2);
  EXPECT_EQ(slicer::attractor_period_label(cycle), 2u);
}

TEST(AttractorFingerprintTest, ShortWindowRequiresCompleteVerificationCycles) {
  class EightCycle : public slicer::SystemBase {
   public:
    std::vector<double> evaluate(const std::vector<double>& state,
                                 const std::vector<double>&) override {
      return {std::fmod(state[0] + 1.0, 8.0)};
    }
    std::string get_name() const override { return "eight_cycle"; }
    std::vector<std::string> get_parameter_names() const override { return {}; }
    std::vector<std::string> get_variable_names() const override { return {"x"}; }
  } system;
  slicer::AttractorTraceConfig config;
  config.num_iter_transient = 0;
  config.period_verification_cycles = 2;
  config.accuracy = 1e-6;
  // Two comparisons of a full eight-point cycle require 24 samples.
  for (const size_t iterations : {20u, 22u, 23u}) {
    config.num_iter_attractor = iterations;
    const auto trace = slicer::trace_attractor_fingerprint(system, {0.0}, {}, config);
    ASSERT_TRUE(trace.converged);
    EXPECT_EQ(trace.fingerprint.periodic, iterations == 23u);
    if (trace.fingerprint.periodic) EXPECT_EQ(trace.fingerprint.period, 8u);
  }
}
