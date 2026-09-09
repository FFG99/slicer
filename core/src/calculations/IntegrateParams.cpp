#include "slicer/calculations/IntegrateParams.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace slicer {

IntegrateParams parse_integrate_params(const nlohmann::json& parameters) {
  IntegrateParams params;
  params.parameters =
      parameters.at("parameters").get<std::map<std::string, double>>();
  params.initial_conditions =
      parameters.at("initial_conditions").get<std::vector<double>>();
  params.output_mode = parameters.at("output_mode").get<std::string>();
  if (parameters.contains("dt") && !parameters.at("dt").is_null()) {
    params.dt = parameters.at("dt").get<double>();
  }

  if (params.initial_conditions.empty()) {
    throw std::invalid_argument("initial_conditions must not be empty");
  }
  if (params.output_mode != "phase_plane" && params.output_mode != "time_series") {
    throw std::invalid_argument("output_mode must be phase_plane or time_series");
  }

  if (params.output_mode == "phase_plane") {
    params.num_iter_transient = parameters.value("num_iter_transient", 0);
    params.num_iter_attractor = parameters.at("num_iter_attractor").get<size_t>();
    if (params.num_iter_attractor == 0) {
      throw std::invalid_argument("num_iter_attractor must be positive");
    }
    return params;
  }

  params.t_max = parameters.at("t_max").get<double>();
  if (params.t_max <= 0.0) {
    throw std::invalid_argument("t_max must be positive");
  }
  return params;
}

namespace {
// Empty / diverged trajectories leave min/max at +/-inf; clamp to a finite range
// so the frame serializes to valid JSON numbers (inf would become null).
double finite_or(double value, double fallback) {
  return std::isfinite(value) ? value : fallback;
}
}  // namespace

CoordinateFrame build_integrate_frame(const IntegrateParams& params,
                                      const std::string& system,
                                      const std::vector<std::string>& variable_names,
                                      double t_min,
                                      double t_max,
                                      const std::vector<double>& state_min,
                                      const std::vector<double>& state_max) {
  CoordinateFrame frame;
  frame.system = system;
  frame.parameters = params.parameters;

  if (params.output_mode == "phase_plane") {
    frame.space = "phase_plane";
    for (size_t i = 0; i < variable_names.size(); ++i) {
      const double min_val = finite_or(i < state_min.size() ? state_min[i] : -1.0, -1.0);
      const double max_val = finite_or(i < state_max.size() ? state_max[i] : 1.0, 1.0);
      frame.axes.push_back(
          Axis{variable_names[i], "state_variable", i, min_val, max_val, std::nullopt});
    }
    return frame;
  }

  frame.space = "time_series";
  frame.axes.push_back(Axis{"t", "time", std::nullopt, finite_or(t_min, 0.0),
                            finite_or(t_max, 0.0), std::nullopt});
  if (!variable_names.empty()) {
    const double min_val = finite_or(state_min.empty() ? -1.0 : state_min[0], -1.0);
    const double max_val = finite_or(state_max.empty() ? 1.0 : state_max[0], 1.0);
    frame.axes.push_back(
        Axis{variable_names[0], "value", 0, min_val, max_val, std::nullopt});
  }
  return frame;
}

}  // namespace slicer
