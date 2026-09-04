'use strict';

// Transport-neutral, synchronous startup transaction shared by the plugin and
// the standalone product. UI/MCP adapters may present the fixed refusal, but
// they may not skip or reorder recovery and cleanup steps.
function initializeProduct(deps) {
  const required = [
    'verifyBundledRuntime', 'ensureDurableRuntime', 'migrateLegacyAuditReceipts',
    'openBatchPackageProtection', 'cleanupLocalData', 'cleanupUiJobs',
    'recoverBatches', 'replayMappingOutbox', 'startBatchMaintenance',
    'cleanupExpiredBatchSnapshots', 'migrateLegacyInput',
    'cleanupAbandonedWorkingJobs', 'refuseStartup'
  ];
  for (const name of required) {
    if (typeof deps?.[name] !== 'function') throw new TypeError(`PRODUCT_BOOTSTRAP_DEPENDENCY_${name}`);
  }
  let batchMaintenance;
  try {
    deps.verifyBundledRuntime();
    deps.ensureDurableRuntime();
    deps.migrateLegacyAuditReceipts();
    const protection = deps.openBatchPackageProtection();
    deps.cleanupLocalData({ trigger: 'startup', protectedIds: protection.ids,
      outputProtectionComplete: protection.complete });
    deps.cleanupUiJobs({ trigger: 'startup' });
    const recovery = deps.recoverBatches();
    const mapping = deps.replayMappingOutbox();
    batchMaintenance = deps.startBatchMaintenance(deps.cleanupExpiredBatchSnapshots);
    if (recovery.failures) throw new Error('Batch recovery failed closed.');
    if (mapping.failures) throw new Error('Mapping outbox recovery failed closed.');
    const migration = deps.migrateLegacyInput();
    if (migration.failures || migration.active) throw new Error('Legacy input migration failed closed.');
    const working = deps.cleanupAbandonedWorkingJobs();
    if (working.failures) throw new Error('Private working-copy cleanup failed closed.');
    return Object.freeze({ batchMaintenance, recovery, mapping, migration, working });
  } catch (error) {
    try { batchMaintenance?.stop(); } catch { /* refusal remains authoritative */ }
    deps.refuseStartup(error);
    throw error;
  }
}

module.exports = { initializeProduct };
