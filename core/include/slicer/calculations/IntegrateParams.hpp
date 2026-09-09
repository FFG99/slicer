#pragma once

#include <cstddef>
#include <map>
#include <optional>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "slicer/artifact/CoordinateFrame.hpp"

namespace slicer {

struct IntegrateParams {
  std::map<std::string, double> parameters;
  std::vector<double> initial_conditions;
  double t_max = 0.0;
  size_t num_iter_transient = 0;
  size_t num_iter_attractor = 0;
  std::optional<double> dt;
  std::string output_mode = "phase_plane";
};

IntegrateParams parse_integrate_params(const nlohmann::json& parameters);

CoordinateFrame build_integrate_frame(const IntegrateParams& params,
                                      const std::string& system,
                                      const std::vector<std::string>& variable_names,
                                      double t_min,
                                      double t_max,
                                      const std::vector<double>& state_min,
                                      const std::vector<double>& state_max);

}  // namespace slicer
