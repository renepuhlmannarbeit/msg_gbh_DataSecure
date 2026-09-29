// Propagates the version in package.json to every place that repeats it.
// Before this script the version was hard-coded in sixteen files, so a release
// could ship a plugin manifest, a runtime and a skill set that disagreed.
//
//   npm run version:sync            keep the current package.json version
//   npm run version:sync -- 3.3.0   set a new version everywhere

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceReleaseSource } from './lib/release-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const previous = pkg.version;

const arguments_ = process.argv.slice(2);
const checkOnly = arguments_.includes('--check');
const explicitTarget = arguments_.find((argument) => argument !== '--check');
const target = explicitTarget || pkg.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(target)) {
  console.error(`Not a semver version: ${target}`);
  process.exit(1);
}

const changed = [];
// Validate the release-source contract before the first write. A missing
// marker must not leave half the repository on a new version.
const releaseSource = fs.readFileSync(path.join(root, 'docs/RELEASE.md'), 'utf8');
const nextReleaseSource = advanceReleaseSource(releaseSource, { previous, target });

function writeIfChanged(rel, next) {
  const file = path.join(root, rel);
  const current = fs.readFileSync(file, 'utf8');
  if (current === next) return;
  if (!checkOnly) fs.writeFileSync(file, next, 'utf8');
  changed.push(rel);
}

function patchJson(rel, mutate) {
  const file = path.join(root, rel);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutate(data);
  writeIfChanged(rel, `${JSON.stringify(data, null, 2)}\n`);
}

function patchText(rel, pattern, replacement) {
  const file = path.join(root, rel);
  const current = fs.readFileSync(file, 'utf8');
  writeIfChanged(rel, current.replace(pattern, replacement));
}

patchJson('package.json', (d) => {
  d.version = target;
});
patchJson('package-lock.json', (d) => {
  d.version = target;
  if (d.packages?.['']) d.packages[''].version = target;
});
patchJson('manifest.json', (d) => {
  d.version = target;
});
patchJson('plugins/data-secure/.claude-plugin/plugin.json', (d) => {
  d.version = target;
});
patchJson('plugins/data-secure/server/standalone/product-manifest.json', (d) => {
  d.version = target;
});
patchJson('apps/datasecure-standalone/tauri-contract/tauri.conf.json', (d) => {
  d.version = target;
});
// Finder's marketing version is numeric; the full RC stays in Cargo, the UI,
// logs and package names. The separately tracked build number never decreases.
patchJson('apps/datasecure-standalone/tauri-contract/tauri.macos.conf.json', (d) => {
  d.version = target.split('-')[0];
  const current = Number(d.bundle.macOS.bundleVersion);
  if (!Number.isSafeInteger(current) || current < 1) throw new Error('MACOS_BUILD_VERSION_INVALID');
  const rc = Number(/-rc(\d+)$/u.exec(target)?.[1] || 0);
  d.bundle.macOS.bundleVersion = String(Math.max(current + (previous === target ? 0 : 1), rc));
});
patchJson('apps/datasecure-standalone/desktop-targets.json', (d) => {
  for (const item of d.targets || []) {
    if (typeof item.product_target === 'string') {
      item.package_filename = `DataSecure-Standalone-${target}-${item.product_target}.zip`;
    }
  }
});
patchJson('BUILD_INFO.json', (d) => {
  d.version = target;
});
patchJson('docs/canonical/TARGET_CAPABILITIES.json', (d) => {
  d.baseline = target;
});
patchJson('docs/acceptance/FORMAL_UAT/CAMPAIGN.template.json', (d) => {
  d.product_version = target;
});

writeIfChanged('plugins/data-secure/VERSION', `${target}\n`);
patchText(
  'plugins/data-secure/server/version.js',
  /VERSION: '[^']*'/,
  `VERSION: '${target}'`
);
patchText(
  'apps/datasecure-standalone/tauri-contract/Cargo.toml',
  /^(\[package\][\s\S]*?^version = ")[^"]+("$)/mu,
  `$1${target}$2`
);
patchText(
  'apps/datasecure-standalone/tauri-contract/Cargo.lock',
  /^(\[\[package\]\]\r?\nname = "datasecure-standalone"\r?\nversion = ")[^"]+("$)/mu,
  `$1${target}$2`
);

// Keep only the explicit current-release labels in sync. Never replace version
// tokens throughout a document: the same files also contain commit-bound,
// historical RC evidence whose original version must remain immutable.
const releaseLabel = (version) => {
  const match = /^(\d+\.\d+\.\d+)-rc(\d+)$/i.exec(version);
  return match ? `${match[1]} RC${match[2]}` : version;
};
const rcLabel = (version) => {
  const match = /-rc(\d+)$/i.exec(version);
  return match ? `RC${match[1]}` : version;
};
// The README title names independently published product candidates. A source
// version cut must not relabel either archive; only publication updates them.
patchText('README.md', /^(Quellstand: )\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/mu,
  `$1${target}`);
patchText('docs/ANLEITUNG.md', /^(Stand:[^\n]*?Version )\d+\.\d+\.\d+ RC\d+(?=[^\n]*$)/mu,
  `$1${releaseLabel(target)}`);
patchText('docs/ANWENDERREVIEW.md', /^(Stand:[^\n]*?gegen )\d+\.\d+\.\d+(?:-rc\d+)?/mu,
  `$1${target}`);
patchText('docs/DETECTOR_BENCHMARK.md',
  /^(## Current synthetic-corpus baseline \()\d+\.\d+\.\d+(?:-rc\d+)?/mu,
  `$1${target}`);
patchText('docs/FORMAT_COVERAGE_MATRIX.md',
  /^(Stand:[^\n]*?Produktversion )\d+\.\d+\.\d+ RC\d+$/mu,
  `$1${releaseLabel(target)}`);
patchText('docs/FORMAT_COVERAGE_MATRIX.md',
  /^(Stand:[^\n]*?lokaler )\d+\.\d+\.\d+(?:-rc\d+)?(?=-Entwicklungsstand)/mu,
  `$1${target}`);
for (const rel of ['docs/IT-BETRIEBSHANDBUCH.md', 'docs/PLUGIN_SECURITY_MODEL.md',
  'docs/RELEASE.md', 'docs/TESTING.md']) {
  patchText(rel, /^(Stand:[^\n]*?· )\d+\.\d+\.\d+(?:-rc\d+)?(?=[^\n]*$)/mu, `$1${target}`);
}
writeIfChanged('docs/RELEASE.md', nextReleaseSource.replace(
  /^(Stand:[^\n]*?· )\d+\.\d+\.\d+(?:-rc\d+)?(?=[^\n]*$)/mu, `$1${target}`));
patchText('docs/acceptance/STANDALONE_UAT_TEST_KIT/README.md',
  /^(Stand:[^\n]*?Engineering-Pilot )\d+\.\d+\.\d+(?:-rc\d+)?$/mu,
  `$1${target}`);
patchText('docs/acceptance/FORMAL_UAT/README.md',
  /^(Stand:[^\n]*?vorbereitet für )\d+\.\d+\.\d+(?:-rc\d+)?/mu,
  `$1${target}`);
patchText('docs/acceptance/FORMAL_UAT/GIT-WORKFLOW.md',
  /rc\d+-uat1/gu, `${rcLabel(target).toLowerCase()}-uat1`);
patchText('plugins/data-secure/README.md',
  /^(Version )\d+\.\d+\.\d+(?:-rc\d+)?/mu, `$1${target}`);

// Canonical documents contain historical RC references that must not be
// rewritten globally. Only their explicit current-state header is versioned.
patchText(
  'docs/canonical/BACKLOG.md',
  /^(Stand: [^\n]*· Produktstand )\S+/mu,
  `$1${target}`
);
for (const rel of [
  'docs/canonical/BACKLOG_EVIDENCE_MATRIX.md',
  'docs/canonical/CURRENT_STATE.md',
  'docs/canonical/TRACEABILITY.md'
]) {
  patchText(rel, /^(Stand: [^·\n]+· )\S+/mu, (_, prefix) => `${prefix}${target}`);
}
patchText(
  'docs/canonical/UML_ARCHITECTURE.md',
  /^(Stand: [^·\n]+· (?:Produktstand )?)(?:\d+\.\d+\.\d+(?:-rc\d+)?[ \t]*)+/mu,
  (_, prefix) => `${prefix}${target}`
);
patchText(
  'docs/canonical/PRODUCT.md',
  /^(Stand: [^·\n]+· Ist-Zustand )\S+/mu,
  (_, prefix) => `${prefix}${rcLabel(target)}`
);

console.log(`version ${target}`);
if (changed.length) {
  for (const rel of changed) console.log(`  ${checkOnly ? 'out of sync' : 'updated'} ${rel}`);
  if (checkOnly) process.exitCode = 1;
} else {
  console.log('  all files already in sync');
}
