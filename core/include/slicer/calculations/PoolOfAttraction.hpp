#pragma once

#include <cstddef>
#include <mutex>
#include <string>
#include <vector>

#include "slicer/artifact/ArtifactFile.hpp"
#include "slicer/calculations/AttractorFingerprint.hpp"
#include "slicer/calculations/PoolOfAttractionParams.hpp"
#include "slicer/systems/SystemBase.hpp"

namespace slicer {

class PoolOfAttractionCalculator {
 public:
  PoolOfAttractionCalculator(PoolOfAttractionParams params, std::string system,
                             std::string systems_dir);

  void run(ArtifactFile& artifact);

 private:
  void validate() const;
  void initialize_system();

  AttractorTraceConfig trace_config() const;
  AttractorMatchParams match_params() const;

  bool trajectory_converges(const std::vector<double>& initial_point) const;

  size_t compute_cell_value(const std::vector<double>& initial,
                            AttractorClassifier& classifier) const;

  double compute_cell_value_float(const std::vector<double>& initial) const;

  PoolOfAttractionParams params_;
  std::string system_;
  std::string systems_dir_;
  SystemPtr dynamical_system_;
  size_t first_var_index_ = 0;
  size_t second_var_index_ = 0;
  std::vector<double> base_initial_conditions_;
  std::vector<double> system_parameters_;
  mutable std::mutex attractors_mutex_;
};

}  // namespace slicer
