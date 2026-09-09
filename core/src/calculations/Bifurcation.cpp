#include "slicer/calculations/Bifurcation.hpp"
#include <algorithm>
#include <iostream>
#include <cmath>
#include <stdexcept>

namespace slicer {
nlohmann::json bifurcation_tree(SystemBase& system, const nlohmann::json& p) {
  const auto names = system.get_parameter_names();
  const auto variables = system.get_variable_names();
  const auto start = p.at("start").get<std::map<std::string, double>>();
  const auto end = p.at("end").get<std::map<std::string, double>>();
  const auto initial = p.at("initial_conditions").get<std::vector<double>>();
  const auto variable = p.at("variable").get<std::string>();
  auto it = std::find(variables.begin(), variables.end(), variable);
  if (it == variables.end() || initial.size() != variables.size())
    throw std::invalid_argument("Invalid variable or initial state dimension");
  const size_t index = static_cast<size_t>(it - variables.begin());
  const long long steps = p.at("steps").get<long long>();
  const long long transient = p.at("num_iter_transient").get<long long>();
  const long long keep = p.at("num_iter_attractor").get<long long>();
  const bool inherit = p.value("inherit", false);
  if (steps < 2 || transient < 0 || keep < 1)
    throw std::invalid_argument("Invalid iteration counts");
  for (const auto& name : names) {
    if (!start.contains(name) || !end.contains(name) ||
        !std::isfinite(start.at(name)) || !std::isfinite(end.at(name)))
      throw std::invalid_argument("Endpoint parameters must be complete and finite");
  }
  std::vector<double> state = initial;
  nlohmann::json samples = nlohmann::json::array();
  for (long long i = 0; i < steps; ++i) {
    const double t = static_cast<double>(i) / (steps - 1);
    std::vector<double> params;
    for (const auto& name : names) params.push_back(std::lerp(start.at(name), end.at(name), t));
    if (!inherit) state = initial;
    std::vector<double> values;
    std::vector<std::vector<double>> states;
    bool diverged = false;
    for (long long n = 0; n < transient; ++n) {
      state = system.evaluate(state, params);
      for (double x : state) if (!std::isfinite(x)) diverged = true;
      if (diverged) break;
    }
    if (!diverged) for (long long n = 0; n < keep; ++n) {
      state = system.evaluate(state, params);
      for (double x : state) if (!std::isfinite(x)) diverged = true;
      if (diverged) { values.clear(); break; }
      values.push_back(state[index]);
      if (p.value("include_states", false)) states.push_back(state);
    }
    if (diverged) states.clear();
    if (diverged && p.value("reset_after_escape", false)) state = initial;
    samples.push_back({{"t",t},{"values",values},{"diverged",diverged}});
    if (p.value("include_states", false)) samples.back()["states"] = states;
    if (p.value("report_progress", false))
      std::cout << nlohmann::json({{"type","progress"},{"completed",i+1},{"total",steps}}).dump() << std::endl;
  }
  return {{"system",system.get_name()},{"variable",variable},{"parameters",p},{"samples",samples}};
}
}
