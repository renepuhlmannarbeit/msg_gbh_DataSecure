'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { profiles } = require('./core-policy-golden');
const { runProductScenarios } = require('./core-policy-product-scenarios');
// Fixed test-only phases make a bounded child failure diagnosable without
// printing source text, generated pseudonyms, paths or capabilities.
const phase = name => fs.writeSync(2, `CORE_POLICY_PHASE:${name}\n`);
const directory = path.resolve(process.argv[2]);
const channel = process.argv[3];
const profile = process.argv[4];
const stage = process.argv[5];
assert.ok(['plugin', 'standalone'].includes(channel));
assert.ok(profiles.includes(profile));
assert.ok(['prepare', 'resume', 'review'].includes(stage));
assert.equal(path.basename(directory), `golden-${channel}-${profile}`);
assert.ok(fs.lstatSync(directory).isDirectory());
assert.equal(fs.lstatSync(directory).isSymbolicLink(), false);
process.env.DATASECURE_PRODUCT_CHANNEL = channel;
process.env.EU_PRIVACY_DATA_ROOT = path.join(directory, 'data');
process.env.EU_PRIVACY_ROOT = path.join(directory, 'private');
process.env.LOCALAPPDATA = path.join(directory, 'localapp');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(directory, 'results');
if (stage === 'prepare') fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);
// These modules come from the actual product projection written by the test,
// not the larger developer checkout which could conceal a missing dependency.
const server = path.join(directory, 'server');
phase('runtime_loading');
const batch = require(path.join(server, 'gateway', 'batch'));
const { readOutput } = require(path.join(server, 'gateway', 'package-store'));
const pii = require(path.join(server, 'pii-engine'));
phase('runtime_loaded');
runProductScenarios({ directory, channel, profile, stage, server, batch, readOutput, pii, phase })
  .then(result => { phase('complete'); process.stdout.write(JSON.stringify(result)); })
  .catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
