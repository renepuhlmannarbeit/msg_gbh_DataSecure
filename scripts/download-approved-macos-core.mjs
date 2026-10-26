// No URL, credential, digest, policy or original-producer override through flags.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGitHubCoreApiReader, downloadApprovedMacCore } from './lib/macos-core-transport.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--target' || args[2] !== '--output') throw Error('MACOS_CORE_TRANSPORT_INPUT_INVALID');
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = downloadApprovedMacCore({ repository, target: args[1], outputDirectory: args[3],
    originalProducerRunId: process.env.CORE_CANDIDATE_RUN_ID,
    originalProducerSourceSha: process.env.CORE_CANDIDATE_SOURCE_SHA, api: createGitHubCoreApiReader() });
  process.stdout.write(JSON.stringify(result) + '\n');
} catch {
  // Vendor/HTTP/JSON exception text, tokens and response bodies never enter logs.
  process.stderr.write('MACOS_CORE_TRANSPORT_FAILED\n');
  process.exitCode = 1;
}
