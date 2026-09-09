#pragma once

#include <cstddef>
#include <memory>
#include <vector>

#include "slicer/systems/SystemBase.hpp"

namespace slicer {

struct AttractorTraceConfig {
  size_t num_iter_transient = 0;
  size_t num_iter_attractor = 0;
  double accuracy = 0.01;
  /** Full cycle repeats that must agree at the end of the attractor window. */
  size_t period_verification_cycles = 2;
};

struct AttractorMatchParams {
  /** Fraction of each omega-limit sample that must match in both directions. */
  double match_coverage = 0.75;
};

/**
 * Sampled omega-limit set of an orbit: the points the trajectory keeps
 * visiting after the transient, in absolute state-space coordinates.
 */
struct AttractorFingerprint {
  size_t period = 0;
  bool periodic = false;
  std::vector<std::vector<double>> points;
  /** Estimated spatial resolution of this sample (residual cycle gap, cloud
   *  density, or cyclic step — see trace_attractor_fingerprint). */
  double scale = 0.0;
};

struct AttractorTraceResult {
  bool converged = false;
  AttractorFingerprint fingerprint;
};

enum class AttractorKind : unsigned char {
  FixedPoint,
  Periodic,
  NonPeriodic,
};

AttractorKind attractor_kind(const AttractorFingerprint& fingerprint);

AttractorTraceResult trace_attractor_fingerprint(SystemBase& system,
                                               const std::vector<double>& initial_point,
                                               const std::vector<double>& params,
                                               const AttractorTraceConfig& config);

bool same_attractor(const AttractorFingerprint& a, const AttractorFingerprint& b,
                    const AttractorMatchParams& params = {});

size_t attractor_period_label(const AttractorFingerprint& fingerprint);

class AttractorClassifier {
 public:
  explicit AttractorClassifier(AttractorMatchParams match_params = {});
  ~AttractorClassifier();
  AttractorClassifier(AttractorClassifier&&) noexcept;
  AttractorClassifier& operator=(AttractorClassifier&&) noexcept;

  size_t classify(const AttractorFingerprint& fingerprint);
  void consolidate();
  std::vector<size_t> final_labels() const;
  /** Indexed by final label; element zero is unused. */
  std::vector<AttractorKind> final_kinds() const;
  /** One verified period per final class; zero denotes a nonperiodic class. */
  std::vector<size_t> final_periods() const;
  size_t class_count() const;

 private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace slicer
