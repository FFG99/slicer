#include "slicer/calculations/FixedPoints.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <complex>
#include <iostream>
#include <limits>
#include <numeric>
#include <stdexcept>

namespace slicer {
namespace {
using J = nlohmann::json;
using V = std::vector<double>;
using M = std::array<std::array<double, 2>, 2>;
constexpr int max_roots = 64;

double norm(const V& x) {
  double result = 0;
  for (double v : x) result = std::max(result, std::abs(v));
  return result;
}

double number(const J& p, const char* name, double fallback) {
  if (!p.contains(name)) return fallback;
  if (!p.at(name).is_number()) throw std::invalid_argument(std::string(name) + " must be numeric");
  double v = p.at(name).get<double>();
  if (!std::isfinite(v)) throw std::invalid_argument(std::string(name) + " must be finite");
  return v;
}

int integer(const J& p, const char* name, int fallback, int low, int high) {
  double v = number(p, name, fallback);
  if (v != std::floor(v) || v < low || v > high)
    throw std::invalid_argument(std::string("Invalid ") + name);
  return static_cast<int>(v);
}

struct Problem {
  SystemBase& system;
  V params, lower, upper;
  double tolerance, derivative_step;
  int iterations;

  V map(const V& x) {
    V y = system.evaluate(x, params);
    if (y.size() != x.size()) throw std::runtime_error("Map output dimension does not match its variables");
    return y;
  }

  bool residual(const V& x, V& r) {
    r = map(x);
    for (size_t k = 0; k < x.size(); ++k) {
      r[k] -= x[k];
      if (!std::isfinite(r[k])) return false;
    }
    return true;
  }

  bool jacobian(const V& x, M& a) {
    for (size_t k = 0; k < x.size(); ++k) {
      double h = derivative_step * std::max(1., std::abs(x[k]));
      std::array<V, 4> f;
      const int shifts[] = {-2, -1, 1, 2};
      for (int j = 0; j < 4; ++j) {
        V xx = x;
        xx[k] += shifts[j] * h;
        f[j] = map(xx);
      }
      for (size_t j = 0; j < x.size(); ++j) {
        a[j][k] = ((f[0][j] - f[3][j]) + 8 * (f[2][j] - f[1][j])) / (12 * h);
        if (!std::isfinite(a[j][k])) return false;
      }
    }
    return true;
  }

  bool inside(const V& x) {
    for (size_t k = 0; k < x.size(); ++k)
      if (!std::isfinite(x[k]) || x[k] < lower[k] || x[k] > upper[k]) return false;
    return true;
  }

  // In 1D, Newton basins can miss an entire branch even with many starting
  // points. Split the search interval at stationary points of F(x)-x, then
  // bracket its sign changes. The candidates are polished by the same Newton
  // corrector as the multistart seeds; no model-specific formula is required.
  std::vector<V> isolate_scalar_roots(int intervals) {
    auto value = [&](double x, double& f) {
      V r;
      if (!residual({x}, r)) return false;
      f = r[0]; return true;
    };
    auto derivative = [&](double x, double& f) {
      M a{};
      if (!jacobian({x}, a)) return false;
      f = a[0][0] - 1; return true;
    };
    auto opposite = [](double a, double b) { return (a < 0 && b > 0) || (a > 0 && b < 0); };
    auto bisect = [&](auto&& function, double a, double b, double fa, double fb, double& root) {
      if (fa == 0) { root = a; return true; }
      if (fb == 0) { root = b; return true; }
      if (!opposite(fa, fb)) return false;
      for (int iteration = 0; iteration < 100; ++iteration) {
        const double mid = std::midpoint(a, b);
        double fm;
        if (!function(mid, fm)) return false;
        root = mid;
        if (fm == 0 || b - a <= .01 * tolerance * std::max(1., std::abs(mid)) || mid == a || mid == b) return true;
        if (opposite(fa, fm)) b = mid;
        else { a = mid; fa = fm; }
      }
      return false;
    };

    V partition;
    std::vector<V> candidates;
    for (int i = 0; i <= intervals; ++i) {
      double x = std::lerp(lower[0], upper[0], double(i) / intervals);
      partition.push_back(x);
      if (i == intervals) break;
      double next = std::lerp(lower[0], upper[0], double(i + 1) / intervals);
      double da, db, stationary;
      if (derivative(x, da) && derivative(next, db) && bisect(derivative, x, next, da, db, stationary))
        partition.push_back(stationary);
    }
    std::sort(partition.begin(), partition.end());
    partition.erase(std::unique(partition.begin(), partition.end()), partition.end());
    for (size_t i = 0; i < partition.size(); ++i) {
      double fa;
      if (!value(partition[i], fa)) continue;
      if (std::abs(fa) <= tolerance) candidates.push_back({partition[i]});
      if (i + 1 == partition.size()) continue;
      double fb, root;
      if (value(partition[i + 1], fb) && opposite(fa, fb) &&
          bisect(value, partition[i], partition[i + 1], fa, fb, root))
        candidates.push_back({root});
    }
    return candidates;
  }

  bool newton(V& x) {
    for (int i = 0; i <= iterations; ++i) {
      V r;
      if (!residual(x, r)) return false;
      const double error = norm(r);
      // Exact roots remain valid even when DF-I is singular (mu=+1).
      if (error == 0) return true;
      if (i == iterations) return false;
      M a{};
      if (!jacobian(x, a)) return false;
      for (size_t k = 0; k < x.size(); ++k) a[k][k] -= 1;
      V dx(x.size());
      // Partial pivoting avoids a determinant test tied to a coordinate scale.
      if (x.size() == 2 && std::abs(a[1][0]) > std::abs(a[0][0])) {
        std::swap(a[0], a[1]);
        std::swap(r[0], r[1]);
      }
      if (a[0][0] == 0) return false;
      if (x.size() == 2) {
        double factor = a[1][0] / a[0][0];
        double pivot = a[1][1] - factor * a[0][1];
        if (pivot == 0 || !std::isfinite(pivot)) return false;
        dx[1] = (r[1] - factor * r[0]) / pivot;
      }
      dx[0] = (r[0] - (x.size() == 2 ? a[0][1] * dx[1] : 0)) / a[0][0];
      for (double v : dx) if (!std::isfinite(v)) return false;
      if (error <= tolerance && norm(dx) <= tolerance * std::max(1., norm(x))) return true;
      bool accepted = false;
      for (double step = 1; step >= 1. / 65536; step *= .5) {
        V next = x, next_r;
        for (size_t k = 0; k < x.size(); ++k) next[k] -= step * dx[k];
        if (inside(next) && residual(next, next_r) && norm(next_r) < error) {
          x = next;
          accepted = true;
          break;
        }
      }
      if (!accepted) return false;
    }
    return false;
  }

  J classify(const V& x, double epsilon) {
    V r;
    M a{};
    if (!residual(x, r) || !jacobian(x, a)) return nullptr;
    std::vector<std::complex<double>> mu;
    if (x.size() == 1) mu.emplace_back(a[0][0], 0);
    else {
      double half_trace = .5 * a[0][0] + .5 * a[1][1];
      // This discriminant avoids cancellation between trace^2 and 4*det.
      double d = .5 * a[0][0] - .5 * a[1][1];
      std::complex<double> root = std::sqrt(std::complex<double>(d * d + a[0][1] * a[1][0], 0));
      if (root.imag() == 0) {
        double first = half_trace + std::copysign(root.real(), half_trace);
        double det = a[0][0] * a[1][1] - a[0][1] * a[1][0];
        mu = {first, first == 0 ? 0. : det / first};
      } else mu = {half_trace + root, half_trace - root};
    }
    int unstable = 0;
    bool neutral = false, complex_pair = false, nonreal_pair = false;
    J multipliers = J::array(), conditions = J::array();
    bool plus = false, minus = false;
    for (auto v : mu) {
      if (!std::isfinite(v.real()) || !std::isfinite(v.imag()) || !std::isfinite(std::abs(v))) return nullptr;
      multipliers.push_back({v.real(), v.imag()});
      unstable += std::abs(v) > 1 + epsilon;
      neutral |= std::abs(std::abs(v) - 1) <= epsilon;
      plus |= std::abs(v - 1.) <= epsilon;
      minus |= std::abs(v + 1.) <= epsilon;
      complex_pair |= v.imag() != 0;
      nonreal_pair |= std::abs(v.imag()) > epsilon;
    }
    if (plus) conditions.push_back("mu_plus_one");
    if (minus) conditions.push_back("mu_minus_one");
    if (nonreal_pair && neutral) conditions.push_back("unit_complex_pair");
    std::string stability = neutral ? "nonhyperbolic" : unstable == 0 ? "stable" : unstable == int(x.size()) ? "repeller" : "saddle";
    std::string type = stability;
    if (x.size() == 1 && !neutral)
      type = unstable == 0 ? "attracting" : "repelling";
    else if (x.size() == 2 && (stability == "stable" || stability == "repeller"))
      type += complex_pair ? "_focus" : "_node";
    return {{"state", x}, {"residual", norm(r)}, {"multipliers", multipliers},
            {"stability", stability}, {"type", type}, {"unstable_dimension", unstable}, {"conditions", conditions}};
  }
};
}  // namespace

J fixed_point_diagram(SystemBase& system, const J& p) {
  const auto variables = system.get_variable_names();
  const auto names = system.get_parameter_names();
  const size_t dimension = variables.size();
  if (dimension != 1 && dimension != 2) throw std::invalid_argument("Fixed-point diagrams support only 1D and 2D maps");
  J start, end;
  if (p.contains("start") || p.contains("end")) {
    start = p.at("start"); end = p.at("end");
  } else {
    const auto parameter = p.at("parameter").get<std::string>();
    if (std::find(names.begin(), names.end(), parameter) == names.end())
      throw std::invalid_argument("Unknown sweep parameter");
    start = end = p.at("model_parameters");
    if (!start.is_object()) throw std::invalid_argument("Model parameters must be an object");
    for (const auto& value : start)
      if (!value.is_number() || !std::isfinite(value.get<double>()))
        throw std::invalid_argument("Model parameters must be finite numbers");
    const double lo = number(p, "parameter_min", 0), hi = number(p, "parameter_max", 1);
    if (lo >= hi) throw std::invalid_argument("Parameter bounds must be ordered");
    start[parameter] = lo; end[parameter] = hi;
  }
  V params, end_params;
  std::vector<size_t> varying;
  if (!start.is_object() || !end.is_object() || start.size() != names.size() || end.size() != names.size())
    throw std::invalid_argument("Both endpoints must specify exactly the model parameters");
  for (size_t k = 0; k < names.size(); ++k) {
    const auto& name = names[k];
    if (!start.contains(name) || !end.contains(name) || !start[name].is_number() || !end[name].is_number())
      throw std::invalid_argument("Missing numeric endpoint parameter: " + name);
    double a = start[name].get<double>(), b = end[name].get<double>();
    if (!std::isfinite(a) || !std::isfinite(b) || !std::isfinite(b - a))
      throw std::invalid_argument("Endpoint parameters must be finite");
    params.push_back(a); end_params.push_back(b);
    if (a != b) varying.push_back(k);
  }
  if (varying.empty()) throw std::invalid_argument("Choose distinct parameter endpoints");
  const std::string parameter = varying.size() == 1 ? names[varying[0]] : "t";
  auto lower = p.at("state_min").get<V>(), upper = p.at("state_max").get<V>();
  if (lower.size() != dimension || upper.size() != dimension) throw std::invalid_argument("State bounds must match map dimension");
  for (size_t k = 0; k < dimension; ++k)
    if (!std::isfinite(lower[k]) || !std::isfinite(upper[k]) || lower[k] >= upper[k] || !std::isfinite(upper[k] - lower[k]))
      throw std::invalid_argument("State bounds must be finite and ordered");
  const double tol = number(p, "tolerance", 1e-10), fd = number(p, "derivative_step", 1e-5);
  const double epsilon = number(p, "stability_tolerance", 1e-6);
  const int steps = integer(p, "steps", 201, 2, 1000), seeds = integer(p, "seeds_per_axis", 9, 2, 32);
  const int iterations = integer(p, "max_iterations", 40, 1, 100);
  const int seed_count = dimension == 1 ? seeds : seeds * seeds;
  if (tol < 1e-13 || tol > 1e-4 || fd < 1e-7 || fd > 1e-2 || epsilon < 1e-9 || epsilon > .01)
    throw std::invalid_argument("Invalid fixed-point settings");
  if (int64_t(steps) * (seed_count + max_roots) * iterations > 2000000)
    throw std::invalid_argument("Newton work limit exceeded; reduce steps, seeds or iterations");
  Problem problem{system, params, lower, upper, tol, fd, iterations};
  J result = {{"format", "slicer.fixed_points.v1"}, {"system", system.get_name()}, {"variables", variables},
              {"parameter", parameter}, {"model_parameters", p.value("model_parameters", start)}, {"settings", p},
              {"start", start}, {"end", end},
              {"method", "multistart_damped_newton"}, {"derivative_method", "five_point"},
              {"samples", J::array()}};
  const int scalar_intervals = std::max(64, seeds * 8);
  if (dimension == 1) {
    result["method"] = "bracketed_and_multistart_newton";
    result["scalar_scan_intervals"] = scalar_intervals;
  }
  std::vector<V> previous;
  size_t root_total = 0;
  for (int i = 0; i < steps; ++i) {
    const double t = double(i) / (steps - 1);
    J model_parameters;
    for (size_t k = 0; k < names.size(); ++k) {
      problem.params[k] = std::lerp(params[k], end_params[k], t);
      model_parameters[names[k]] = problem.params[k];
    }
    const double value = varying.size() == 1 ? problem.params[varying[0]] : t;
    std::vector<V> starts = previous, roots;
    if (dimension == 1) {
      auto isolated = problem.isolate_scalar_roots(scalar_intervals);
      starts.insert(starts.end(), isolated.begin(), isolated.end());
    }
    for (int n = 0; n < seed_count; ++n) {
      V x(dimension);
      x[0] = std::lerp(lower[0], upper[0], double(n % seeds) / (seeds - 1));
      if (dimension == 2) x[1] = std::lerp(lower[1], upper[1], double(n / seeds) / (seeds - 1));
      starts.push_back(x);
    }
    int failed = 0, invalid = 0;
    J points = J::array();
    for (auto x : starts) {
      if (!problem.newton(x)) { ++failed; continue; }
      bool duplicate = false;
      for (const auto& other : roots) {
        double distance = 0;
        for (size_t k = 0; k < dimension; ++k)
          distance = std::max(distance, std::abs(x[k] - other[k]) / std::max({1., std::abs(x[k]), std::abs(other[k])}));
        if (distance <= 10 * tol) { duplicate = true; break; }
      }
      if (duplicate) continue;
      J point = problem.classify(x, epsilon);
      if (point.is_null()) { ++invalid; continue; }
      if (roots.size() == max_roots || ++root_total > 50000)
        throw std::runtime_error("Too many fixed points; reduce the search domain or parameter resolution (the root set may be non-isolated)");
      roots.push_back(x);
      points.push_back(point);
    }
    previous = roots;
    result["samples"].push_back({{"t", t}, {"parameter", value}, {"model_parameters", model_parameters}, {"points", points}, {"attempts", starts.size()},
                                  {"failed_attempts", failed}, {"invalid_derivatives", invalid}});
    std::cout << "SLICER_PROGRESS " << double(i + 1) / steps << std::endl;
  }
  return result;
}
}  // namespace slicer
