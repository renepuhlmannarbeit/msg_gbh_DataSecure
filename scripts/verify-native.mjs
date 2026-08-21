import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyNativeArtifact } from './lib/native-artifact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = path.join(root, 'plugins', 'data-secure', 'bin', 'windows-x64', 'datasecure-sandbox.exe');
const checksum = path.join(root, 'plugins', 'data-secure', 'bin', 'windows-x64', 'datasecure-sandbox.sha256');
const result = verifyNativeArtifact(executable, checksum);
console.log(`Native launcher verified: ${result.machine} sha256=${result.sha256}`);
