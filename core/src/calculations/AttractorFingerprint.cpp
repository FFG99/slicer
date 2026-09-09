#include "slicer/calculations/AttractorFingerprint.hpp"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <unordered_map>

namespace slicer {
namespace {

/** Divergence is escape to infinity: a state that overflowed to inf/nan. Large
 *  but finite transient excursions are not divergence (the orbit may settle). */
bool is_finite_state(const std::vector<double>& point) {
  for (double x : point) {
    if (!std::isfinite(x)) {
      return false;
    }
  }
  return true;
}

double squared_distance(const std::vector<double>& a, const std::vector<double>& b) {
  double sum = 0.0;
  const size_t dim = std::min(a.size(), b.size());
  for (size_t i = 0; i < dim; ++i) {
    const double delta = a[i] - b[i];
    sum += delta * delta;
  }
  return sum;
}

/** Upper bound on the cycle length we are willing to search for. Longer
 *  repetition is treated as aperiodic/chaotic for visualization purposes. */
constexpr size_t kMaxPeriodCap = 1024;

/** Accumulated reference samples kept per attractor class. */
constexpr size_t kMaxClassPoints = 8192;

/** Points probed when estimating the sampling density of an aperiodic cloud. */
constexpr size_t kScaleProbes = 128;

/** Match tolerance for a pair: ε = scale_a + scale_b (α = 1). */
double pair_tolerance(const AttractorFingerprint& a, const AttractorFingerprint& b) {
  return a.scale + b.scale;
}

/** Smallest spatial-hash cell; only affects lookup performance, not results. */
constexpr double kMinCellSize = 1e-9;

/**
 * A period is accepted only if the trajectory reproduces it over
 * `verification_cycles` full consecutive cycles at the END of the window.
 */
bool verify_period_at_end(const std::vector<std::vector<double>>& trajectory, size_t period,
                          double accuracy_square, size_t verification_cycles) {
  if (verification_cycles == 0 || period == 0) {
    return false;
  }
  // Each comparison needs a complete reference cycle as well as the verified cycles.
  // Division avoids overflow when checking the required sample count.
  if (trajectory.size() / period <= verification_cycles) {
    return false;
  }
  const size_t last = trajectory.size() - 1;
  for (size_t k = 0; k < period; ++k) {
    for (size_t c = 1; c <= verification_cycles; ++c) {
      const auto& fresh = trajectory[last - (c - 1) * period - k];
      const auto& older = trajectory[last - c * period - k];
      if (squared_distance(fresh, older) >= accuracy_square) {
        return false;
      }
    }
  }
  return true;
}

size_t detect_verified_period(const std::vector<std::vector<double>>& trajectory,
                              double accuracy_square, size_t verification_cycles) {
  const size_t last = trajectory.size() - 1;
  const size_t max_period = std::min(kMaxPeriodCap, last / 2);
  for (size_t period = 1; period <= max_period; ++period) {
    if (squared_distance(trajectory[last], trajectory[last - period]) >= accuracy_square) {
      continue;
    }
    if (verify_period_at_end(trajectory, period, accuracy_square, verification_cycles)) {
      return period;
    }
  }
  return 0;
}

/** Coordinates below the floating-point resolution of the sample coordinates
 *  are noise; no sample can claim a spatial resolution finer than this. */
double machine_resolution_floor(const std::vector<std::vector<double>>& points) {
  double max_abs = 0.0;
  for (const auto& point : points) {
    for (double x : point) {
      max_abs = std::max(max_abs, std::abs(x));
    }
  }
  return 32.0 * std::numeric_limits<double>::epsilon() * max_abs;
}

/**
 * Residual distance from a settled cycle sample to its true limit cycle,
 * extrapolated from the data. Consecutive cycle repeats shrink geometrically
 * (gap_n ~ r_n*(1-rho), r_{n+1} = rho*r_n with rho the Floquet contraction),
 * so the remaining distance is gap/(1-rho) with rho estimated as the ratio of
 * the last two repeat gaps.
 */
double periodic_scale(const std::vector<std::vector<double>>& trajectory, size_t period) {
  const size_t last = trajectory.size() - 1;
  double gap_last = 0.0;
  for (size_t k = 0; k < period; ++k) {
    gap_last = std::max(gap_last, std::sqrt(squared_distance(
                                      trajectory[last - k], trajectory[last - period - k])));
  }
  double rho = 0.0;
  if (3 * period <= last) {
    double gap_prev = 0.0;
    for (size_t k = 0; k < period; ++k) {
      gap_prev = std::max(gap_prev,
                          std::sqrt(squared_distance(trajectory[last - period - k],
                                                     trajectory[last - 2 * period - k])));
    }
    if (gap_prev > 0.0) {
      rho = std::clamp(gap_last / gap_prev, 0.0, 0.9);
    }
  }
  return gap_last / (1.0 - rho);
}

/** Median distance between consecutive samples on a verified cycle. */
double cyclic_step_scale(const std::vector<std::vector<double>>& points, size_t period) {
  if (period < 2 || points.size() < period) {
    return 0.0;
  }
  std::vector<double> steps(period);
  for (size_t i = 0; i < period; ++i) {
    steps[i] = std::sqrt(squared_distance(points[i], points[(i + 1) % period]));
  }
  const size_t mid = period / 2;
  std::nth_element(steps.begin(), steps.begin() + static_cast<std::ptrdiff_t>(mid), steps.end());
  return steps[mid];
}

/**
 * Typical spacing implied by the sample's spatial extent: bounding-box
 * diagonal divided by sqrt(n), where n is the attractor-window sample size.
 */
double envelope_sampling_scale(const std::vector<std::vector<double>>& points) {
  if (points.size() < 2) {
    return 0.0;
  }
  const size_t dim = points.front().size();
  std::vector<double> lo(dim, std::numeric_limits<double>::infinity());
  std::vector<double> hi(dim, -std::numeric_limits<double>::infinity());
  for (const auto& point : points) {
    for (size_t d = 0; d < dim; ++d) {
      lo[d] = std::min(lo[d], point[d]);
      hi[d] = std::max(hi[d], point[d]);
    }
  }
  double diag_sq = 0.0;
  for (size_t d = 0; d < dim; ++d) {
    const double delta = hi[d] - lo[d];
    diag_sq += delta * delta;
  }
  return std::sqrt(diag_sq) / std::sqrt(static_cast<double>(points.size()));
}

double aperiodic_scale(const std::vector<std::vector<double>>& points) {
  if (points.size() < 2) {
    return 0.0;
  }
  const size_t probes = std::min(kScaleProbes, points.size());
  std::vector<double> nearest(probes, std::numeric_limits<double>::infinity());
  for (size_t p = 0; p < probes; ++p) {
    const size_t idx = p * points.size() / probes;
    for (size_t j = 0; j < points.size(); ++j) {
      if (j == idx) {
        continue;
      }
      nearest[p] = std::min(nearest[p], squared_distance(points[idx], points[j]));
    }
  }
  const size_t rank = std::min(probes - 1, (probes * 9) / 10);
  std::nth_element(nearest.begin(), nearest.begin() + rank, nearest.end());
  return std::sqrt(nearest[rank]);
}

class PointIndex {
 public:
  PointIndex(size_t dim, double cell_size)
      : dim_(dim), cell_size_(std::max(cell_size, kMinCellSize)) {}

  void insert(const std::vector<double>& point, uint32_t id) {
    buckets_[cell_key(point)].push_back(id);
  }

  bool has_neighbor(const std::vector<double>& query,
                    const std::vector<std::vector<double>>& points, double tolerance) const {
    const double tol_sq = tolerance * tolerance;
    const int64_t radius =
        static_cast<int64_t>(std::ceil(std::max(tolerance, 0.0) / cell_size_));
    double window = 1.0;
    for (size_t i = 0; i < dim_; ++i) {
      window *= static_cast<double>(2 * radius + 1);
    }
    if (dim_ > 8 || window > 4096.0) {
      for (const auto& p : points) {
        if (squared_distance(query, p) <= tol_sq) {
          return true;
        }
      }
      return false;
    }

    std::vector<int64_t> base(dim_);
    for (size_t i = 0; i < dim_; ++i) {
      base[i] = quantize(query[i]);
    }
    const size_t combos = static_cast<size_t>(window);
    const size_t width = static_cast<size_t>(2 * radius + 1);
    std::vector<int64_t> cell(dim_);
    for (size_t m = 0; m < combos; ++m) {
      size_t rem = m;
      for (size_t i = 0; i < dim_; ++i) {
        cell[i] = base[i] + static_cast<int64_t>(rem % width) - radius;
        rem /= width;
      }
      const auto it = buckets_.find(hash_cell(cell));
      if (it == buckets_.end()) {
        continue;
      }
      for (const uint32_t id : it->second) {
        if (squared_distance(query, points[id]) <= tol_sq) {
          return true;
        }
      }
    }
    return false;
  }

 private:
  int64_t quantize(double v) const { return static_cast<int64_t>(std::floor(v / cell_size_)); }

  uint64_t cell_key(const std::vector<double>& point) const {
    std::vector<int64_t> cell(dim_);
    for (size_t i = 0; i < dim_; ++i) {
      cell[i] = quantize(point[i]);
    }
    return hash_cell(cell);
  }

  static uint64_t hash_cell(const std::vector<int64_t>& cell) {
    uint64_t hash = 1469598103934665603ULL;
    for (const int64_t c : cell) {
      uint64_t v = static_cast<uint64_t>(c);
      for (int byte = 0; byte < 8; ++byte) {
        hash ^= (v >> (byte * 8)) & 0xFFu;
        hash *= 1099511628211ULL;
      }
    }
    return hash;
  }

  size_t dim_;
  double cell_size_;
  std::unordered_map<uint64_t, std::vector<uint32_t>> buckets_;
};

bool covers(const std::vector<std::vector<double>>& queries, const PointIndex& index,
            const std::vector<std::vector<double>>& reference_points, double tolerance,
            double match_coverage) {
  if (queries.empty() || reference_points.empty()) {
    return false;
  }
  const size_t needed =
      static_cast<size_t>(std::ceil(match_coverage * static_cast<double>(queries.size())));
  size_t matched = 0;
  for (size_t i = 0; i < queries.size(); ++i) {
    if (index.has_neighbor(queries[i], reference_points, tolerance)) {
      ++matched;
      if (matched >= needed) {
        return true;
      }
    }
    const size_t remaining = queries.size() - i - 1;
    if (matched + remaining < needed) {
      return false;
    }
  }
  return matched >= needed;
}

PointIndex build_index(const std::vector<std::vector<double>>& points, double cell_size) {
  PointIndex index(points.empty() ? 0 : points.front().size(), cell_size);
  for (size_t i = 0; i < points.size(); ++i) {
    index.insert(points[i], static_cast<uint32_t>(i));
  }
  return index;
}

}  // namespace

AttractorTraceResult trace_attractor_fingerprint(SystemBase& system,
                                                 const std::vector<double>& initial_point,
                                                 const std::vector<double>& params,
                                                 const AttractorTraceConfig& config) {
  AttractorTraceResult result;

  std::vector<double> state = initial_point;
  for (size_t i = 0; i < config.num_iter_transient; ++i) {
    state = system.evaluate(state, params);
    if (!is_finite_state(state)) {
      return result;
    }
  }

  std::vector<std::vector<double>> trajectory;
  trajectory.reserve(config.num_iter_attractor + 1);
  trajectory.push_back(state);

  for (size_t i = 0; i < config.num_iter_attractor; ++i) {
    state = system.evaluate(state, params);
    if (!is_finite_state(state)) {
      return result;
    }
    trajectory.push_back(state);
  }

  const double accuracy_square = config.accuracy * config.accuracy;
  const size_t period =
      detect_verified_period(trajectory, accuracy_square, config.period_verification_cycles);

  auto& fingerprint = result.fingerprint;
  fingerprint.periodic = period != 0;
  fingerprint.period = period != 0 ? period : config.num_iter_attractor;

  if (period != 0) {
    const size_t take = std::min(period, trajectory.size());
    fingerprint.points.assign(trajectory.end() - static_cast<std::ptrdiff_t>(take),
                              trajectory.end());
    const double residual = periodic_scale(trajectory, period);
    const double step = cyclic_step_scale(fingerprint.points, period);
    fingerprint.scale = std::max(residual, step);
  } else {
    fingerprint.points = trajectory;
    const double nn_scale = aperiodic_scale(fingerprint.points);
    fingerprint.scale = std::max(nn_scale, envelope_sampling_scale(fingerprint.points));
  }
  fingerprint.scale = std::max({fingerprint.scale, config.accuracy,
                                machine_resolution_floor(fingerprint.points)});

  result.converged = true;
  return result;
}

bool same_attractor(const AttractorFingerprint& a, const AttractorFingerprint& b,
                    const AttractorMatchParams& params) {
  if (a.points.empty() || b.points.empty()) {
    return false;
  }
  if (a.periodic != b.periodic) {
    return false;
  }
  if (a.periodic && b.periodic && a.period != b.period) {
    return false;
  }
  const double tolerance = pair_tolerance(a, b);
  const PointIndex index_a = build_index(a.points, a.scale);
  const PointIndex index_b = build_index(b.points, b.scale);
  return covers(a.points, index_b, b.points, tolerance, params.match_coverage) &&
         covers(b.points, index_a, a.points, tolerance, params.match_coverage);
}

size_t attractor_period_label(const AttractorFingerprint& fingerprint) {
  return fingerprint.period;
}

AttractorKind attractor_kind(const AttractorFingerprint& fingerprint) {
  if (!fingerprint.periodic) {
    return AttractorKind::NonPeriodic;
  }
  return fingerprint.period == 1 ? AttractorKind::FixedPoint : AttractorKind::Periodic;
}

struct AttractorClassifier::Impl {
  struct ClassEntry {
    std::vector<std::vector<double>> points;
    double scale;
    size_t period = 0;
    bool periodic = false;
    PointIndex index;
    size_t parent;
  };

  size_t resolve_root(size_t id) const {
    while (classes[id].parent != id) {
      id = classes[id].parent;
    }
    return id;
  }

  AttractorFingerprint class_fingerprint(const ClassEntry& entry) const {
    AttractorFingerprint fingerprint;
    fingerprint.points = entry.points;
    fingerprint.scale = entry.scale;
    fingerprint.period = entry.period;
    fingerprint.periodic = entry.periodic;
    return fingerprint;
  }

  void absorb_points(size_t canonical, ClassEntry& target, ClassEntry& absorbed,
                     double dedup_tolerance) {
    target.scale = std::min(target.scale, absorbed.scale);
    for (const auto& point : absorbed.points) {
      if (target.points.size() >= kMaxClassPoints) {
        break;
      }
      if (!target.index.has_neighbor(point, target.points, dedup_tolerance)) {
        target.points.push_back(point);
        target.index.insert(target.points.back(),
                            static_cast<uint32_t>(target.points.size() - 1));
      }
    }
    absorbed.parent = canonical;
    absorbed.points.clear();
    absorbed.points.shrink_to_fit();
  }

  void merge_classes(size_t canonical, size_t absorbed_id) {
    if (canonical == absorbed_id) {
      return;
    }
    auto& target = classes[canonical];
    auto& absorbed = classes[absorbed_id];
    if (absorbed.parent != absorbed_id) {
      return;
    }
    AttractorFingerprint fa = class_fingerprint(target);
    AttractorFingerprint fb = class_fingerprint(absorbed);
    const double dedup_tolerance = pair_tolerance(fa, fb);
    absorb_points(canonical, target, absorbed, dedup_tolerance);
    target.scale = std::min(target.scale, absorbed.scale);
  }

  AttractorMatchParams match_params;
  std::vector<ClassEntry> classes;
};

AttractorClassifier::AttractorClassifier(AttractorMatchParams match_params)
    : impl_(std::make_unique<Impl>()) {
  impl_->match_params = std::move(match_params);
}

AttractorClassifier::~AttractorClassifier() = default;
AttractorClassifier::AttractorClassifier(AttractorClassifier&&) noexcept = default;
AttractorClassifier& AttractorClassifier::operator=(AttractorClassifier&&) noexcept = default;

size_t AttractorClassifier::classify(const AttractorFingerprint& fingerprint) {
  if (fingerprint.points.empty()) {
    return 0;
  }
  auto& impl = *impl_;
  const size_t dim = fingerprint.points.front().size();

  std::vector<size_t> matches;
  for (size_t id = 0; id < impl.classes.size(); ++id) {
    if (impl.classes[id].parent != id) {
      continue;
    }
    const auto& entry = impl.classes[id];
    if (!same_attractor(fingerprint, impl.class_fingerprint(entry), impl.match_params)) {
      continue;
    }
    matches.push_back(id);
  }

  if (matches.empty()) {
    Impl::ClassEntry entry{fingerprint.points,
                           fingerprint.scale,
                           fingerprint.period,
                           fingerprint.periodic,
                           PointIndex(dim, fingerprint.scale),
                           impl.classes.size()};
    for (size_t i = 0; i < entry.points.size(); ++i) {
      entry.index.insert(entry.points[i], static_cast<uint32_t>(i));
    }
    impl.classes.push_back(std::move(entry));
    return impl.classes.size();
  }

  const size_t canonical = matches.front();
  auto& target = impl.classes[canonical];
  const double dedup_tolerance =
      pair_tolerance(fingerprint, impl.class_fingerprint(target));
  target.scale = std::min(target.scale, fingerprint.scale);
  for (size_t m = 1; m < matches.size(); ++m) {
    impl.merge_classes(canonical, matches[m]);
  }

  for (const auto& point : fingerprint.points) {
    if (target.points.size() >= kMaxClassPoints) {
      break;
    }
    if (!target.index.has_neighbor(point, target.points, dedup_tolerance)) {
      target.points.push_back(point);
      target.index.insert(target.points.back(),
                          static_cast<uint32_t>(target.points.size() - 1));
    }
  }

  return canonical + 1;
}

void AttractorClassifier::consolidate() {
  auto& impl = *impl_;
  bool changed = true;
  while (changed) {
    changed = false;
    for (size_t i = 0; i < impl.classes.size(); ++i) {
      const size_t root_i = impl.resolve_root(i);
      if (impl.classes[root_i].parent != root_i) {
        continue;
      }
      for (size_t j = i + 1; j < impl.classes.size(); ++j) {
        const size_t root_j = impl.resolve_root(j);
        if (root_i == root_j || impl.classes[root_j].parent != root_j) {
          continue;
        }
        if (same_attractor(impl.class_fingerprint(impl.classes[root_i]),
                           impl.class_fingerprint(impl.classes[root_j]), impl.match_params)) {
          impl.merge_classes(root_i, root_j);
          changed = true;
        }
      }
    }
  }
}

std::vector<size_t> AttractorClassifier::final_labels() const {
  const auto& impl = *impl_;
  std::vector<size_t> root_final(impl.classes.size(), 0);
  size_t next = 0;
  for (size_t id = 0; id < impl.classes.size(); ++id) {
    if (impl.classes[id].parent == id) {
      root_final[id] = ++next;
    }
  }
  std::vector<size_t> labels(impl.classes.size() + 1, 0);
  for (size_t id = 0; id < impl.classes.size(); ++id) {
    labels[id + 1] = root_final[impl.resolve_root(id)];
  }
  return labels;
}

std::vector<AttractorKind> AttractorClassifier::final_kinds() const {
  const auto& impl = *impl_;
  std::vector<AttractorKind> kinds(1, AttractorKind::NonPeriodic);
  for (size_t id = 0; id < impl.classes.size(); ++id) {
    if (impl.classes[id].parent != id) {
      continue;
    }
    kinds.push_back(attractor_kind(impl.class_fingerprint(impl.classes[id])));
  }
  return kinds;
}

std::vector<size_t> AttractorClassifier::final_periods() const {
  const auto& impl = *impl_;
  std::vector<size_t> periods;
  for (size_t id = 0; id < impl.classes.size(); ++id) {
    if (impl.classes[id].parent == id) {
      periods.push_back(impl.classes[id].periodic ? impl.classes[id].period : 0);
    }
  }
  return periods;
}

size_t AttractorClassifier::class_count() const {
  const auto& impl = *impl_;
  size_t count = 0;
  for (size_t id = 0; id < impl.classes.size(); ++id) {
    if (impl.classes[id].parent == id) {
      ++count;
    }
  }
  return count;
}

}  // namespace slicer
