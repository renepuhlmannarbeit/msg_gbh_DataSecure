'use strict';

// Explicit target applicability is separate from test success. Do not count a
// platform guard returning without assertions as a native passed test.
function createPlatformCases({ platform = process.platform, write = value => process.stdout.write(value) } = {}) {
  const counts = { total: 0, passed: 0, skipped: 0, failed: 0 };
  async function test(name, callback, options = {}) {
    const ordinal = ++counts.total;
    if (options.platform && options.platform !== platform) {
      counts.skipped++;
      write(`skip ${ordinal} - ${name} # SKIP requires ${options.platform}; host ${platform}\n`);
      return;
    }
    try {
      await callback();
      counts.passed++;
      write(`ok ${ordinal} - ${name}\n`);
    } catch (error) {
      counts.failed++;
      throw error;
    }
  }
  return { test, snapshot: () => ({ ...counts }) };
}

module.exports = { createPlatformCases };
