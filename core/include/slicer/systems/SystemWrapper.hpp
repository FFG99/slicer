#pragma once

#include <memory>

#include "SystemBase.hpp"

namespace slicer {

struct SystemWrapper {
  SystemBase* ptr;
};

inline SystemWrapper wrap_system(SystemPtr&& system) {
  return SystemWrapper{system.release()};
}

inline SystemPtr unwrap_system(SystemWrapper wrapper) {
  return SystemPtr(wrapper.ptr);
}

}  // namespace slicer
