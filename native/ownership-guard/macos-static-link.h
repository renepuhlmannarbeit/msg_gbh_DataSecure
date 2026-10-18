#ifndef DATASECURE_OWNERSHIP_GUARD_LINK_H_
#define DATASECURE_OWNERSHIP_GUARD_LINK_H_

#if !defined(__APPLE__) || !defined(DATASECURE_OWNERSHIP_STATIC)
#error The static ownership binding is an explicit macOS-core build only
#endif
#if defined(NODE_SHARED_MODE) || defined(BUILDING_NODE_EXTENSION)
#error The ownership binding requires the actual statically linked Node core
#endif
#if !defined(__aarch64__) && !defined(__arm64__) && !defined(__x86_64__)
#error The static ownership binding has not been scoped for this architecture
#endif

namespace node {
class Environment;
void RegisterDataSecureOwnershipGuard(Environment* env);
}  // namespace node

#endif  // DATASECURE_OWNERSHIP_GUARD_LINK_H_
