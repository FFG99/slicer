#pragma once

#include <cstddef>
#include <string>
#include <utility>
#include <vector>

#include "slicer/artifact/ArtifactFile.hpp"
#include "slicer/calculations/DynamicModesParams.hpp"
#include "slicer/systems/SystemBase.hpp"

namespace slicer {

class DynamicModesCalculator {
 public:
  DynamicModesCalculator(DynamicModesParams params, std::string system, std::string systems_dir);

  void run(ArtifactFile& artifact);

 private:
  void validate() const;
  void initialize_system();

  std::pair<size_t, std::vector<double>> calculate_period(
      const std::vector<double>& starting_point,
      const std::vector<double>& thread_params) const;

  DynamicModesParams params_;
  std::string system_;
  std::string systems_dir_;
  SystemPtr dynamical_system_;
  size_t first_param_index_ = 0;
  size_t second_param_index_ = 0;
  std::vector<double> params_base_;
};

}  // namespace slicer
