import childProcess from 'node:child_process';

function safeText(value, maximum = 500) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\0\r\n]/u.test(value);
}

function licenseRef(name, version) {
  return `LicenseRef-Cargo-${String(name).replace(/[^A-Za-z0-9.-]/gu, '-')}-${String(version).replace(/[^A-Za-z0-9.-]/gu, '-')}`;
}

export function cargoLicenseInventoryFromMetadata(metadata) {
  if (!metadata || metadata.version !== 1 || !Array.isArray(metadata.packages) ||
      !metadata.resolve || !safeText(metadata.resolve.root, 2000) || !Array.isArray(metadata.resolve.nodes)) {
    throw new Error('CARGO_LICENSE_METADATA_INVALID');
  }
  const packages = new Map(metadata.packages.map((item) => [item.id, item]));
  const nodes = new Map(metadata.resolve.nodes.map((item) => [item.id, item]));
  if (packages.size !== metadata.packages.length || nodes.size !== metadata.resolve.nodes.length ||
      !packages.has(metadata.resolve.root) || !nodes.has(metadata.resolve.root)) {
    throw new Error('CARGO_LICENSE_METADATA_INVALID');
  }
  const reachable = new Set();
  const queue = [metadata.resolve.root];
  while (queue.length) {
    const id = queue.shift();
    if (reachable.has(id)) continue;
    const node = nodes.get(id);
    if (!node || !Array.isArray(node.deps)) throw new Error('CARGO_LICENSE_METADATA_INVALID');
    reachable.add(id);
    for (const dependency of node.deps) {
      if (!dependency || !safeText(dependency.pkg, 2000) || !Array.isArray(dependency.dep_kinds)) {
        throw new Error('CARGO_LICENSE_METADATA_INVALID');
      }
      if (dependency.dep_kinds.some((kind) => kind?.kind !== 'dev')) queue.push(dependency.pkg);
    }
  }
  reachable.delete(metadata.resolve.root);
  const components = [...reachable].map((id) => {
    const item = packages.get(id);
    if (!item || !safeText(item.name, 200) || !safeText(item.version, 100) || !safeText(item.source, 2000)) {
      throw new Error('CARGO_LICENSE_METADATA_INVALID');
    }
    const declared = safeText(item.license, 500) ? item.license : null;
    const file = safeText(item.license_file, 2000) ? item.license_file : null;
    if (!declared && !file) throw new Error(`CARGO_LICENSE_UNDECLARED:${item.name}@${item.version}`);
    return {
      name: item.name,
      version: item.version,
      source: item.source,
      license: declared || licenseRef(item.name, item.version),
      license_basis: declared ? 'cargo_metadata' : 'cargo_license_file',
      ...(file ? { license_file: file } : {}),
      ...(safeText(item.repository, 2000) ? { repository: item.repository } : {})
    };
  }).sort((left, right) => left.name.localeCompare(right.name, 'en') || left.version.localeCompare(right.version, 'en'));
  if (!components.length || new Set(components.map((item) => `${item.name}@${item.version}`)).size !== components.length) {
    throw new Error('CARGO_LICENSE_METADATA_INVALID');
  }
  return Object.freeze({ schema: 'datasecure-rust-license-inventory/1', components });
}

export function loadCargoLicenseInventory(manifestPath, rustTarget, options = {}) {
  const supportedTargets = new Set([
    'x86_64-pc-windows-msvc',
    'x86_64-apple-darwin',
    'aarch64-apple-darwin',
    'x86_64-unknown-linux-gnu'
  ]);
  if (!safeText(manifestPath, 4000) || !supportedTargets.has(rustTarget)) {
    throw new Error('CARGO_LICENSE_ARGUMENT_INVALID');
  }
  const result = (options.spawnSync || childProcess.spawnSync)('cargo', [
    'metadata', '--offline', '--locked', '--format-version', '1',
    '--filter-platform', rustTarget, '--manifest-path', manifestPath
  ], { encoding: 'utf8', windowsHide: true, shell: false, maxBuffer: 64 * 1024 * 1024 });
  const stdout = String(result?.stdout || '');
  if (result?.error || result?.status !== 0 || stdout.length === 0 || stdout.length > 64 * 1024 * 1024 || stdout.includes('\0')) {
    throw new Error('CARGO_LICENSE_METADATA_FAILED');
  }
  let metadata;
  try { metadata = JSON.parse(stdout); } catch { throw new Error('CARGO_LICENSE_METADATA_INVALID'); }
  return cargoLicenseInventoryFromMetadata(metadata);
}
