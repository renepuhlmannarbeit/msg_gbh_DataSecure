// Propagates the version in package.json to every place that repeats it.
// Before this script the version was hard-coded in sixteen files, so a release
// could ship a plugin manifest, a runtime and a skill set that disagreed.
//
//   npm run version:sync            keep the current package.json version
//   npm run version:sync -- 3.3.0   set a new version everywhere

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const previous = pkg.version;

const target = process.argv[2] || pkg.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(target)) {
  console.error(`Not a semver version: ${target}`);
  process.exit(1);
}

const changed = [];

function writeIfChanged(rel, next) {
  const file = path.join(root, rel);
  const current = fs.readFileSync(file, 'utf8');
  if (current === next) return;
  fs.writeFileSync(file, next, 'utf8');
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
patchJson('BUILD_INFO.json', (d) => {
  d.version = target;
});
patchJson('docs/canonical/TARGET_CAPABILITIES.json', (d) => {
  d.baseline = target;
});

writeIfChanged('plugins/data-secure/VERSION', `${target}\n`);
patchText(
  'plugins/data-secure/server/version.js',
  /VERSION: '[^']*'/,
  `VERSION: '${target}'`
);

// Keep the small set of user-facing, current-release documents in sync as well.
// Historical backlog evidence deliberately stays on the version in which it happened.
const releaseLabel = (version) => {
  const match = /^(\d+\.\d+\.\d+)-rc(\d+)$/i.exec(version);
  return match ? `${match[1]} RC${match[2]}` : version;
};
const rcLabel = (version) => {
  const match = /-rc(\d+)$/i.exec(version);
  return match ? `RC${match[1]}` : version;
};
for (const rel of [
  'README.md',
  'docs/ANLEITUNG.md',
  'docs/FORMAT_COVERAGE_MATRIX.md',
  'docs/IT-BETRIEBSHANDBUCH.md',
  'docs/PILOT-ABNAHME.md',
  'docs/PLUGIN_SECURITY_MODEL.md',
  'docs/RELEASE.md',
  'docs/TESTING.md',
  'plugins/data-secure/README.md',
  'plugins/data-secure/skills/gbh-datasecure-dokument-anonymisieren/references/unterstuetzte-formate.md'
]) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  const current = fs.readFileSync(file, 'utf8');
  const next = current
    .replaceAll(previous, target)
    .replaceAll(releaseLabel(previous), releaseLabel(target))
    .replaceAll(rcLabel(previous), rcLabel(target));
  writeIfChanged(rel, next);
}

for (const rel of ['docs/PLUGIN_SECURITY_MODEL.md', 'docs/RELEASE.md', 'docs/TESTING.md']) {
  patchText(
    rel,
    /^(Stand:[^\n]*?)(\d+\.\d+\.\d+(?:-rc\d+| RC\d+))/mu,
    (_, prefix, previousLabel) => prefix + (previousLabel.includes(' RC') ? releaseLabel(target) : target)
  );
}

// Canonical documents contain historical RC references that must not be
// rewritten globally. Only their explicit current-state header is versioned.
patchText(
  'docs/canonical/BACKLOG.md',
  /^(Stand: [^\n]*· Produktstand )\S+/mu,
  `$1${target}`
);
for (const rel of ['docs/canonical/CURRENT_STATE.md', 'docs/canonical/TRACEABILITY.md']) {
  patchText(rel, /^(Stand: [^·\n]+· )\S+/mu, (_, prefix) => `${prefix}${target}`);
}
patchText(
  'docs/canonical/PRODUCT.md',
  /^(Stand: [^·\n]+· Ist-Zustand )\S+/mu,
  (_, prefix) => `${prefix}${rcLabel(target)}`
);

console.log(`version ${target}`);
if (changed.length) {
  for (const rel of changed) console.log(`  updated ${rel}`);
} else {
  console.log('  all files already in sync');
}
