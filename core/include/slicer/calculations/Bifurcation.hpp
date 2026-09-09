#pragma once
#include <nlohmann/json.hpp>
#include "slicer/systems/SystemBase.hpp"
namespace slicer {
nlohmann::json bifurcation_tree(SystemBase& system, const nlohmann::json& parameters);
}
