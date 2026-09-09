#pragma once

#include <nlohmann/json.hpp>

#include <map>
#include <optional>
#include <string>
#include <vector>

namespace slicer {

struct Axis {
  std::string name;
  std::string role;
  std::optional<size_t> index;
  std::optional<double> min;
  std::optional<double> max;
  std::optional<size_t> steps;
};

struct CoordinateFrame {
  std::string system;
  std::string space;
  std::map<std::string, double> parameters;
  std::vector<Axis> axes;
  bool cell_centered = false;
  // Set for trajectory calculations (phase_portrait) when the orbit escaped to
  // infinity; the stored trajectory is truncated at the last finite point.
  std::optional<bool> diverged;
};

void to_json(nlohmann::json& j, const Axis& axis);
void from_json(const nlohmann::json& j, Axis& axis);
void to_json(nlohmann::json& j, const CoordinateFrame& frame);
void from_json(const nlohmann::json& j, CoordinateFrame& frame);

}  // namespace slicer
