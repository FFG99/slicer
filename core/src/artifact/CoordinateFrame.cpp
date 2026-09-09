#include "slicer/artifact/CoordinateFrame.hpp"

namespace slicer {

void to_json(nlohmann::json& j, const Axis& axis) {
  j = nlohmann::json{{"name", axis.name}, {"role", axis.role}};
  if (axis.index) {
    j["index"] = *axis.index;
  }
  if (axis.min) {
    j["min"] = *axis.min;
  }
  if (axis.max) {
    j["max"] = *axis.max;
  }
  if (axis.steps) {
    j["steps"] = *axis.steps;
  }
}

void from_json(const nlohmann::json& j, Axis& axis) {
  axis.name = j.at("name").get<std::string>();
  axis.role = j.at("role").get<std::string>();
  if (j.contains("index")) {
    axis.index = j.at("index").get<size_t>();
  }
  if (j.contains("min")) {
    axis.min = j.at("min").get<double>();
  }
  if (j.contains("max")) {
    axis.max = j.at("max").get<double>();
  }
  if (j.contains("steps")) {
    axis.steps = j.at("steps").get<size_t>();
  }
}

void to_json(nlohmann::json& j, const CoordinateFrame& frame) {
  j = nlohmann::json{
      {"system", frame.system},
      {"space", frame.space},
      {"parameters", frame.parameters},
      {"axes", frame.axes},
      {"cell_centered", frame.cell_centered},
  };
  if (frame.diverged) {
    j["diverged"] = *frame.diverged;
  }
}

void from_json(const nlohmann::json& j, CoordinateFrame& frame) {
  frame.system = j.at("system").get<std::string>();
  frame.space = j.at("space").get<std::string>();
  frame.parameters = j.value("parameters", std::map<std::string, double>{});
  frame.axes = j.at("axes").get<std::vector<Axis>>();
  frame.cell_centered = j.value("cell_centered", false);
  if (j.contains("diverged")) {
    frame.diverged = j.at("diverged").get<bool>();
  }
}

}  // namespace slicer
