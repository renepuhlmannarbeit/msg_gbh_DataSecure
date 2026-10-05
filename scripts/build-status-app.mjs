import fs from 'node:fs';
import boundFileIo from '../plugins/data-secure/server/core/bound-file-io.js';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { writeBoundArtifact } from './lib/bound-artifact-writer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'plugins/data-secure/server/status-app');
const check = process.argv.includes('--check');
const localRequire = createRequire(import.meta.url);
const sdk = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/@modelcontextprotocol/ext-apps/package.json'), 'utf8'));
if (sdk.version !== '1.7.5') throw new Error('Unexpected status UI SDK version');
const entry = path.join(root, 'ui/status-card/entry.mjs');
const repositoryResolver = {
  name: 'repository-bound-resolver',
  setup(context) {
    context.onResolve({ filter: /^\.\.?\// }, (args) => ({ path: path.resolve(args.resolveDir, args.path) }));
    context.onResolve({ filter: /^(?:@[^/]+\/|[A-Za-z0-9_-])/ }, (args) => {
      const resolved = localRequire.resolve(args.path, { paths: [root] });
      const real = fs.realpathSync(resolved);
      const repository = `${fs.realpathSync(root)}${path.sep}`;
      if (!real.startsWith(repository)) throw new Error(`Status UI dependency escaped repository: ${args.path}`);
      return { path: real };
    });
  }
};
const result = await build({
  absWorkingDir: root,
  // Feeding the already-bound local entry as stdin prevents esbuild from
  // interpreting a Windows path as a package name or walking parent folders.
  // resolveDir still gives imported modules the normal repository boundary.
  stdin: {
    contents: fs.readFileSync(entry, 'utf8'),
    resolveDir: path.dirname(entry),
    sourcefile: 'entry.mjs',
    loader: 'js'
  },
  plugins: [repositoryResolver],
  bundle: true,
  minify: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  target: ['chrome120', 'safari17'],
  metafile: true,
  legalComments: 'inline'
});
const script = result.outputFiles[0].text.replace(/<\/script/giu, '<\\/script');
const template = fs.readFileSync(path.join(root, 'ui/status-card/template.html'), 'utf8');
// A function replacement keeps JavaScript's $&, $` and $' literal.
const html = template.replace('<!-- STATUS_APP_SCRIPT -->', () => `<script>${script}</script>`);
new vm.Script(script);
if (Buffer.byteLength(html) > 768 * 1024) throw new Error('Status UI exceeds offline bundle budget');
const packages = new Map();
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.includes('node_modules/')) continue;
  let directory = path.dirname(path.resolve(root, input));
  while (directory.startsWith(path.join(root, 'node_modules') + path.sep)) {
    const manifest = path.join(directory, 'package.json');
    if (fs.existsSync(manifest)) {
      const info = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (info.name && info.version) { packages.set(info.name, { directory, info }); break; }
    }
    directory = path.dirname(directory);
  }
}
let notices = '# Bundled status-card licenses\n\nGenerated from the exact bundled dependencies; development tools are not shipped.\n';
const dependencies = [];
for (const [name, { directory, info }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
  const license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map(file => path.join(directory, file)).find(file => fs.existsSync(file));
  if (!license) throw new Error(`Missing license for bundled dependency: ${name}`);
  const licenseText = boundFileIo.readBoundFile(license, { maximum: 2 * 1024 * 1024, checkCtime: true }).toString('utf8');
  const locked = lock.packages[path.relative(root, directory).split(path.sep).join('/')];
  if (!locked?.integrity || locked.version !== info.version) throw new Error(`Unlocked bundled dependency: ${name}`);
  dependencies.push({ name, version: info.version, integrity: locked.integrity, license_sha256: crypto.createHash('sha256').update(licenseText).digest('hex') });
  notices += `\n## ${name} ${info.version}\n\n${licenseText}\n`;
}
const artifact = { schema: 'datasecure-status-app-artifact/v1', sha256: crypto.createHash('sha256').update(html).digest('hex'), bytes: Buffer.byteLength(html), sdk_version: sdk.version, release_enabled: false };
for (const [name, data] of [['status-card.html', html], ['artifact.json', JSON.stringify(artifact, null, 2) + '\n'], ['THIRD_PARTY_NOTICES.md', notices], ['bundled-dependencies.json', JSON.stringify({ schema: 'datasecure-status-app-dependencies/v1', dependencies }, null, 2) + '\n']]) {
  const destination = path.join(target, name);
  if (check) {
    if (!fs.existsSync(destination) || boundFileIo.readBoundFile(destination, { maximum: 2 * 1024 * 1024, checkCtime: true }).toString('utf8') !== data) throw new Error(`Stale status UI artifact: ${name}`);
  } else {
    writeBoundArtifact(destination, data);
  }
}
console.log(`Status card ${check ? 'verified' : 'built'}: ${artifact.bytes} bytes; ${packages.size} bundled dependencies; release disabled`);
