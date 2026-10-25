#pragma once

#include <nlohmann/json.hpp>
#include "slicer/systems/SystemBase.hpp"

namespace slicer {
// Multistart damped Newton for F(x,p)-x=0, for one- and two-dimensional maps.
nlohmann::json fixed_point_diagram(SystemBase& system, const nlohmann::json& parameters);
}
