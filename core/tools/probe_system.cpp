#include <dlfcn.h>

#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "slicer/systems/SystemWrapper.hpp"

namespace {

std::string json_escape(const std::string& value) {
  std::ostringstream out;
  out << '"';
  for (char ch : value) {
    if (ch == '"' || ch == '\\') {
      out << '\\';
    }
    out << ch;
  }
  out << '"';
  return out.str();
}

void print_string_array(const std::vector<std::string>& items) {
  std::cout << '[';
  for (size_t index = 0; index < items.size(); ++index) {
    if (index > 0) {
      std::cout << ',';
    }
    std::cout << json_escape(items[index]);
  }
  std::cout << ']';
}

}  // namespace

int main(int argc, char** argv) {
  if (argc != 2) {
    std::cerr << "usage: slicer-probe-system <plugin-path>\n";
    return 2;
  }

  void* handle = dlopen(argv[1], RTLD_LAZY);
  if (!handle) {
    std::cerr << dlerror() << '\n';
    return 1;
  }

  auto create_system = reinterpret_cast<slicer::SystemWrapper (*)()>(
      dlsym(handle, "create_system"));
  if (!create_system) {
    std::cerr << "create_system not found\n";
    dlclose(handle);
    return 1;
  }

  auto system = slicer::unwrap_system(create_system());
  const std::string name = system->get_name();
  const auto parameters = system->get_parameter_names();
  const auto variables = system->get_variable_names();
  system.release();

  std::cout << '{'
            << "\"name\":" << json_escape(name) << ','
            << "\"parameters\":";
  print_string_array(parameters);
  std::cout << ",\"variables\":";
  print_string_array(variables);
  std::cout << '}' << std::endl;

  dlclose(handle);
  return 0;
}
