import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyKeyringArtifacts, EXPECTED_TARGETS } from '../scripts/lib/keyring-artifacts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = verifyKeyringArtifacts(path.join(root, 'plugins', 'data-secure', 'server', 'vendor', 'keyring'));
if (result.version !== '1.3.0' || result.targets !== EXPECTED_TARGETS.length) {
  throw new Error('vendored keyring verification returned an unexpected result');
}
console.log(`Vendored keyring artifacts: PASS (${result.targets} targets, v${result.version})`);
