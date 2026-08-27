import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EXPECTED_TARGETS = Object.freeze([
  'darwin-arm64',
  'darwin-x64',
  'linux-x64-gnu',
  'linux-x64-musl',
  'win32-x64-msvc'
]);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function binaryMatchesTarget(bytes, target) {
  if (target.startsWith('win32-')) return bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a;
  if (target.startsWith('linux-')) return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  if (target.startsWith('darwin-')) {
    if (bytes.length < 4) return false;
    const magic = bytes.readUInt32BE(0);
    return new Set([0xcafebabe, 0xcafebabf, 0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe]).has(magic);
  }
  return false;
}

export function verifyKeyringArtifacts(vendorRoot) {
  const manifestPath = path.join(vendorRoot, 'bundle-manifest.json');
  const packagePath = path.join(vendorRoot, 'package.json');
  const lockPath = path.join(vendorRoot, 'package-lock.json');
  for (const required of [manifestPath, packagePath, lockPath]) {
    if (!fs.existsSync(required)) throw new Error(`vendored keyring metadata missing: ${path.basename(required)}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (manifest.schema !== 'data-secure-keyring-bundle/1' || manifest.package !== '@napi-rs/keyring' ||
      manifest.version !== '1.3.0' || manifest.license !== 'MIT' || !Array.isArray(manifest.targets)) {
    throw new Error('vendored keyring manifest invalid');
  }
  const targets = manifest.targets.map((entry) => entry.target).sort();
  if (JSON.stringify(targets) !== JSON.stringify([...EXPECTED_TARGETS].sort())) {
    throw new Error('vendored keyring target matrix incomplete');
  }
  const expectedPackages = ['@napi-rs/keyring', ...EXPECTED_TARGETS.map((target) => `@napi-rs/keyring-${target}`)];
  if (JSON.stringify(Object.keys(pkg.dependencies || {}).sort()) !== JSON.stringify(expectedPackages.sort()) ||
      Object.values(pkg.dependencies).some((version) => version !== '1.3.0')) {
    throw new Error('vendored keyring dependency set is not exactly pinned');
  }
  if (lock.lockfileVersion !== 3 || !lock.packages ||
      Object.values(lock.packages).filter((entry) => entry?.resolved).some((entry) =>
        entry.version !== '1.3.0' || typeof entry.integrity !== 'string' || !entry.integrity.startsWith('sha512-'))) {
    throw new Error('vendored keyring lockfile is not exact and integrity-bound');
  }
  const declaredFiles = new Set();
  for (const entry of manifest.targets) {
    if (!entry || typeof entry.file !== 'string' || path.isAbsolute(entry.file) || entry.file.includes('..')) {
      throw new Error('vendored keyring target path invalid');
    }
    const full = path.resolve(vendorRoot, ...entry.file.split('/'));
    if (!full.startsWith(`${path.resolve(vendorRoot)}${path.sep}`) || !fs.existsSync(full)) {
      throw new Error(`vendored keyring target missing: ${entry.target}`);
    }
    const stat = fs.lstatSync(full);
    const bytes = fs.readFileSync(full);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.bytes || sha256(bytes) !== entry.sha256 ||
        !binaryMatchesTarget(bytes, entry.target)) {
      throw new Error(`vendored keyring target invalid: ${entry.target}`);
    }
    const packageJson = JSON.parse(fs.readFileSync(path.join(path.dirname(full), 'package.json'), 'utf8'));
    if (packageJson.version !== manifest.version || packageJson.license !== manifest.license) {
      throw new Error(`vendored keyring package metadata invalid: ${entry.target}`);
    }
    declaredFiles.add(path.normalize(full));
  }
  const actualNative = [];
  const pending = [path.join(vendorRoot, 'node_modules')];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile() && entry.name.endsWith('.node')) actualNative.push(path.normalize(full));
      else if (!entry.isFile()) throw new Error('vendored keyring contains a non-regular entry');
    }
  }
  if (JSON.stringify(actualNative.sort()) !== JSON.stringify([...declaredFiles].sort())) {
    throw new Error('vendored keyring contains undeclared native binaries');
  }
  return Object.freeze({ version: manifest.version, targets: manifest.targets.length });
}

export { EXPECTED_TARGETS };
