import path from 'node:path';
import { relocateMacNative } from './lib/macos-bundle-native.mjs';

const argument = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const target = argument('--target'), app = argument('--app');
if (!['macos-x64', 'macos-arm64'].includes(target) || !app) throw new Error('STANDALONE_MACOS_LAYOUT_ARGUMENT_INVALID');
process.stdout.write(`${JSON.stringify({ ok: true, ...relocateMacNative(path.resolve(app), target) })}\n`);
