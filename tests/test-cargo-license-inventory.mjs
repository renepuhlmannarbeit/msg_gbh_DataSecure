import { createSuite } from './helpers.js';
import {
  cargoLicenseInventoryFromMetadata,
  loadCargoLicenseInventory
} from '../scripts/lib/cargo-license-inventory.mjs';

const { test, done, assert } = createSuite('Target-bound Rust license inventory');

function fixture() {
  return {
    version: 1,
    packages: [
      { id: 'root', name: 'app', version: '1.0.0', source: null },
      { id: 'a', name: 'tauri', version: '2.11.5', source: 'registry+https://github.com/rust-lang/crates.io-index', license: 'MIT OR Apache-2.0', license_file: null, repository: 'https://github.com/tauri-apps/tauri' },
      { id: 'b', name: 'file-license', version: '1.2.3', source: 'registry+https://github.com/rust-lang/crates.io-index', license: null, license_file: '/cache/file-license/LICENSE' },
      { id: 'dev', name: 'dev-only', version: '9.9.9', source: 'registry+https://github.com/rust-lang/crates.io-index', license: null, license_file: null }
    ],
    resolve: {
      root: 'root',
      nodes: [
        { id: 'root', deps: [
          { pkg: 'a', dep_kinds: [{ kind: null }] },
          { pkg: 'dev', dep_kinds: [{ kind: 'dev' }] }
        ] },
        { id: 'a', deps: [{ pkg: 'b', dep_kinds: [{ kind: 'build' }] }] },
        { id: 'b', deps: [] },
        { id: 'dev', deps: [] }
      ]
    }
  };
}

test('only target-resolved non-development crates receive explicit component licenses', () => {
  const result = cargoLicenseInventoryFromMetadata(fixture());
  assert.strictEqual(result.schema, 'datasecure-rust-license-inventory/1');
  assert.deepStrictEqual(result.components.map((item) => item.name), ['file-license', 'tauri']);
  assert.strictEqual(result.components[0].license, 'LicenseRef-Cargo-file-license-1.2.3');
  assert.strictEqual(result.components[0].license_basis, 'cargo_license_file');
  assert.strictEqual(result.components[1].license, 'MIT OR Apache-2.0');
  assert.doesNotMatch(JSON.stringify(result), /NOASSERTION|dev-only/u);
});

test('a reachable crate without a declaration or license file stops the build', () => {
  const metadata = fixture();
  metadata.packages.find((item) => item.id === 'b').license_file = null;
  assert.throws(() => cargoLicenseInventoryFromMetadata(metadata), /CARGO_LICENSE_UNDECLARED:file-license@1\.2\.3/u);
});

test('the loader uses locked offline target-filtered Cargo metadata without a shell', () => {
  const calls = [];
  const result = loadCargoLicenseInventory('C:/source/Cargo.toml', 'x86_64-pc-windows-msvc', {
    spawnSync(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: JSON.stringify(fixture()) };
    }
  });
  assert.strictEqual(result.components.length, 2);
  assert.strictEqual(calls[0].command, 'cargo');
  assert.deepStrictEqual(calls[0].args.slice(0, 7), [
    'metadata', '--offline', '--locked', '--format-version', '1', '--filter-platform', 'x86_64-pc-windows-msvc'
  ]);
  assert.strictEqual(calls[0].options.shell, false);
});

test('the loader accepts every declared desktop Rust target and rejects arbitrary triples', () => {
  for (const target of [
    'x86_64-pc-windows-msvc',
    'x86_64-apple-darwin',
    'aarch64-apple-darwin',
    'x86_64-unknown-linux-gnu'
  ]) {
    const result = loadCargoLicenseInventory('C:/source/Cargo.toml', target, {
      spawnSync: () => ({ status: 0, stdout: JSON.stringify(fixture()) })
    });
    assert.strictEqual(result.components.length, 2);
  }
  assert.throws(() => loadCargoLicenseInventory('C:/source/Cargo.toml', 'aarch64-attacker-example', {
    spawnSync: () => ({ status: 0, stdout: JSON.stringify(fixture()) })
  }), /CARGO_LICENSE_ARGUMENT_INVALID/u);
});

test('damaged metadata and subprocess failures stay content-free', () => {
  assert.throws(() => cargoLicenseInventoryFromMetadata({}), /CARGO_LICENSE_METADATA_INVALID/u);
  assert.throws(() => loadCargoLicenseInventory('C:/source/Cargo.toml', 'x86_64-pc-windows-msvc', {
    spawnSync: () => ({ status: 1, stderr: 'private builder path' })
  }), (error) => error.message === 'CARGO_LICENSE_METADATA_FAILED' && !error.message.includes('private'));
});

done();
