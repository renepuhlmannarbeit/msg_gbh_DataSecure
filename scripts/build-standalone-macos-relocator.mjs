import { buildMacRelocator } from './lib/macos-build-relocator.mjs';

if (process.argv.length !== 2) throw new Error('MACOS_RELOCATOR_BUILD_ARGUMENT_INVALID');
buildMacRelocator();
process.stdout.write('MACOS_RELOCATOR_BUILD_ONLY_READY\n');
