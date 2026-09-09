#pragma once

#include <string>

#include "slicer/artifact/ArtifactFile.hpp"
#include "slicer/calculations/IntegrateParams.hpp"
#include "slicer/systems/SystemBase.hpp"

namespace slicer {

class IntegrateCalculator {
 public:
  IntegrateCalculator(IntegrateParams params, std::string system, std::string systems_dir);

  void run(ArtifactFile& artifact);

 private:
  void validate() const;
  void initialize_system();

  IntegrateParams params_;
  std::string system_;
  std::string systems_dir_;
  SystemPtr dynamical_system_;
  std::vector<double> system_parameters_;
};

}  // namespace slicer
