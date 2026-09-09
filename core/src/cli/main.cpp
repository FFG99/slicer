#include <cstdlib>
#include <fstream>
#include "slicer/systems/SystemManager.hpp"
#include "slicer/calculations/Bifurcation.hpp"
#include <filesystem>
#include <iostream>
#include <string>

#include "slicer/artifact/ArtifactFile.hpp"
#include "slicer/calculations/AttractionMap.hpp"
#include "slicer/calculations/AttractionMapParams.hpp"
#include "slicer/calculations/DynamicModes.hpp"
#include "slicer/calculations/DynamicModesParams.hpp"
#include "slicer/calculations/Integrate.hpp"
#include "slicer/calculations/IntegrateParams.hpp"
#include "slicer/calculations/LyapunovSpectrum.hpp"
#include "slicer/calculations/LyapunovSpectrumParams.hpp"
#include "slicer/calculations/PoolOfAttraction.hpp"
#include "slicer/calculations/PoolOfAttractionParams.hpp"
#include "slicer/io/JobSpec.hpp"

namespace {

void print_usage() {
  std::cerr << "Usage: slicer run --job <path.json> --output <path.h5> "
               "[--systems-dir <dir>]\n";
}

std::string get_systems_dir(int argc, char** argv) {
  for (int i = 1; i < argc - 1; ++i) {
    if (std::string(argv[i]) == "--systems-dir") {
      return argv[i + 1];
    }
  }
  if (const char* env = std::getenv("SLICER_SYSTEMS_DIR")) {
    return env;
  }
  return "systems";
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 5) {
    print_usage();
    return 1;
  }

  std::string command = argv[1];
  if (command != "run") {
    print_usage();
    return 1;
  }

  std::string job_path;
  std::string output_path;
  for (int i = 2; i < argc - 1; ++i) {
    const std::string arg = argv[i];
    if (arg == "--job") {
      job_path = argv[i + 1];
    } else if (arg == "--output") {
      output_path = argv[i + 1];
    }
  }

  if (job_path.empty() || output_path.empty()) {
    print_usage();
    return 1;
  }

  try {
    const slicer::JobSpec job = slicer::parse_job_spec_file(job_path);
    const std::string systems_dir = get_systems_dir(argc, argv);

    auto& manager = slicer::SystemManager::instance();
    const double threshold = job.parameters.value("escape_threshold", std::numeric_limits<double>::infinity());
    manager.set_escape_threshold(threshold);
    if (job.calculation_type == "bifurcation") {
      manager.load_systems(systems_dir);
      auto system = manager.create_system(job.system);
      std::ofstream output(output_path);
      output << slicer::bifurcation_tree(*system, job.parameters).dump();
      if (!output) throw std::runtime_error("Failed to write bifurcation output");
      return 0;
    }

    auto artifact = slicer::ArtifactFile::create(output_path, job.calculation_type,
                                                 job.system, job.parameters);

    if (job.calculation_type == "attraction_map") {
      const auto params = slicer::parse_attraction_map_params(job.parameters);
      slicer::AttractionMapCalculator calculator(params, job.system, systems_dir);
      calculator.run(artifact);
    } else if (job.calculation_type == "phase_portrait") {
      const auto params = slicer::parse_integrate_params(job.parameters);
      slicer::IntegrateCalculator calculator(params, job.system, systems_dir);
      calculator.run(artifact);
    } else if (job.calculation_type == "pool_of_attraction") {
      const auto params = slicer::parse_pool_of_attraction_params(job.parameters);
      slicer::PoolOfAttractionCalculator calculator(params, job.system, systems_dir);
      calculator.run(artifact);
    } else if (job.calculation_type == "lyapunov_spectrum") {
      const auto params = slicer::parse_lyapunov_spectrum_params(job.parameters);
      slicer::LyapunovSpectrumCalculator calculator(params, job.system, systems_dir);
      calculator.run(artifact);
    } else if (job.calculation_type == "dynamic_modes") {
      const auto params = slicer::parse_dynamic_modes_params(job.parameters);
      slicer::DynamicModesCalculator calculator(params, job.system, systems_dir);
      calculator.run(artifact);
    } else {
      throw std::runtime_error("Unsupported calculation_type: " + job.calculation_type);
    }

    std::cout << "Wrote artifact to " << output_path << '\n';
    return 0;
  } catch (const std::exception& ex) {
    std::cerr << "Error: " << ex.what() << '\n';
    return 1;
  }
}
