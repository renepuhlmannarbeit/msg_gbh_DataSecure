'use strict';

// Keep the executable entry point intentionally tiny. Product imports happen
// behind this boundary so packaging/load failures cannot print a Node stack
// with local paths before the regular startup guard becomes available.
try {
  require('./mcp-server');
} catch (error) {
  try {
    require('./gateway/startup-guard').refuseStartup(error);
  } catch {
    try { process.stderr.write('DataSecure-Start verweigert: STARTUP_FAILED. Lokale Verarbeitung ist nicht verfügbar.\n'); } catch {}
    process.exit(1);
  }
}
