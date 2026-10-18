// Explicit macOS static Core adapter. No dynamic loading or auto-registration.
#include "datasecure/ownership-guard-link.h"
#include "node.h"
#include "node_api.h"

#if NAPI_VERSION != 8 || defined(NAPI_EXPERIMENTAL)
#error The ownership guard is an explicit stable Node-API-8 module
#endif

// The C translation unit supplies exactly this unique, non-static initializer.
// It is NOT napi_register_module_v1 and does not rely on NAPI_MODULE magic.
extern "C" napi_value datasecure_ownership_guard_napi_init(napi_env env,
                                                       napi_value exports);

namespace node {
void RegisterDataSecureOwnershipGuard(Environment* env) {
  // String literal and code pointer both outlive all Environments/Workers.
  // The explicit version avoids the deprecated napi_module descriptor path.
  AddLinkedBinding(env, "datasecure_ownership_guard",
                   datasecure_ownership_guard_napi_init, 8);
}
}  // namespace node
