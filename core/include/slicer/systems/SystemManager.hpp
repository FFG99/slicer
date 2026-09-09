#pragma once

#include <dlfcn.h>

#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include "SystemBase.hpp"
#include "BoundedSystem.hpp"
#include "SystemWrapper.hpp"

namespace slicer {

namespace {

bool is_valid_system_name(const std::string& name) {
  if (name.empty() || name[0] < 'a' || name[0] > 'z') {
    return false;
  }
  for (const char ch : name) {
    const bool ok =
        (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_';
    if (!ok) {
      return false;
    }
  }
  return true;
}

bool is_legacy_plugin_stem(const std::string& stem) {
  constexpr std::string_view prefix = "lib";
  constexpr std::string_view suffix = "_plugin";
  return stem.size() > prefix.size() + suffix.size() &&
         stem.rfind(prefix, 0) == 0 &&
         stem.compare(stem.size() - suffix.size(), suffix.size(), suffix) == 0;
}

std::string legacy_plugin_canonical_name(const std::string& stem) {
  constexpr std::size_t prefix_len = 3;
  constexpr std::size_t suffix_len = 7;
  return stem.substr(prefix_len, stem.size() - prefix_len - suffix_len);
}

}  // namespace

class SystemManager {
 public:
  static SystemManager& instance() {
    static SystemManager mgr;
    return mgr;
  }

  SystemManager(const SystemManager&) = delete;
  SystemManager& operator=(const SystemManager&) = delete;

  void load_systems(const std::string& directory) {
    namespace fs = std::filesystem;
    if (!fs::exists(directory)) {
      throw std::runtime_error("Systems directory not found: " + directory);
    }

    for (const auto& entry : fs::directory_iterator(directory)) {
      if (!entry.is_regular_file()) {
        continue;
      }

      const auto ext = entry.path().extension().string();
#if defined(__APPLE__)
      if (ext != ".dylib") {
        continue;
      }
#elif defined(__linux__)
      if (ext != ".so") {
        continue;
      }
#else
      continue;
#endif

      const std::string filename = entry.path().string();
      const std::string stem = entry.path().stem().string();
      if (is_legacy_plugin_stem(stem)) {
        if (systems_.count(legacy_plugin_canonical_name(stem)) > 0) {
          continue;
        }
      } else if (is_valid_system_name(stem) && systems_.count(stem) > 0) {
        continue;
      }

      void* handle = dlopen(filename.c_str(), RTLD_LAZY);
      if (!handle) {
        std::cerr << "Failed to load " << filename << ": " << dlerror() << '\n';
        continue;
      }

      auto create_system = reinterpret_cast<SystemWrapper (*)()>(
          dlsym(handle, "create_system"));
      if (!create_system) {
        std::cerr << "create_system not found in " << filename << '\n';
        dlclose(handle);
        continue;
      }

      auto system = unwrap_system(create_system());
      const std::string system_name = system->get_name();
      if (systems_.count(system_name)) {
        std::cerr << "System " << system_name << " already loaded, skipping\n";
        dlclose(handle);
        continue;
      }

      systems_[system_name] = SystemInfo{handle, create_system};
    }
  }

  std::vector<std::string> get_system_names() const {
    std::vector<std::string> names;
    names.reserve(systems_.size());
    for (const auto& [name, _] : systems_) {
      names.push_back(name);
    }
    return names;
  }

  void set_escape_threshold(double threshold) {
    if (!(threshold > 0)) throw std::invalid_argument("escape_threshold must be positive");
    escape_threshold_ = threshold;
  }

  SystemPtr create_system(const std::string& name) {
    const auto it = systems_.find(name);
    if (it == systems_.end()) {
      throw std::runtime_error("System not found: " + name);
    }
    return std::make_unique<BoundedSystem>(unwrap_system(it->second.create_system()), escape_threshold_);
  }

  ~SystemManager() {
    for (const auto& [_, info] : systems_) {
      dlclose(info.handle);
    }
  }

 private:
  SystemManager() = default;
  double escape_threshold_ = std::numeric_limits<double>::infinity();

  struct SystemInfo {
    void* handle;
    SystemWrapper (*create_system)();
  };

  std::unordered_map<std::string, SystemInfo> systems_;
};

}  // namespace slicer
