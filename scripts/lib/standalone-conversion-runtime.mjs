import fs from 'node:fs';
import path from 'node:path';
import boundFileIo from '../../plugins/data-secure/server/core/bound-file-io.js';
import { readRegular, sha256, readStandaloneRuntimeContract, verifyTargetEvidence } from './bundled-runtime.mjs';
import { derivePdfjsTextPaintModule, PDFJS_TEXT_PAINT_HOOK } from './pdfjs-text-paint-hook.mjs';

const BINDINGS = Object.freeze({ 'windows-x64': 'canvas-win32-x64-msvc',
  'macos-x64': 'canvas-darwin-x64', 'macos-arm64': 'canvas-darwin-arm64',
  'linux-x64-glibc': 'canvas-linux-x64-gnu' });
const PINNED = Object.freeze({ 'tesseract.js': '7.0.0', 'tesseract.js-core': '7.0.0',
  '@napi-rs/canvas': '1.0.7', 'pdfjs-dist': '6.2.108',
  'mdast-util-from-markdown': '2.0.2', 'parse5': '7.3.0' });
const MAX_FILES = 4096, MAX_BYTES = 384 * 1024 * 1024;

function regularBytes(file) {
  // Empty legal package files are allowed; runtime/binary/model reads below
  // retain their stricter existing contracts.
  try { return boundFileIo.readBoundFile(file, { maximum: 128 * 1024 * 1024, checkCtime: true }); }
  catch { throw new Error('CONVERSION_PACKAGE_FILE_UNSAFE'); }
}

export function collectConversionRuntime(repoRoot, productTarget) {
  const root = path.resolve(repoRoot), binding = BINDINGS[productTarget];
  if (!binding) throw new Error('CONVERSION_PACKAGE_TARGET_UNSUPPORTED');
  const files = new Map(), packages = [];
  let total = 0;
  function add(relative, bytes) {
    if (!/^[A-Za-z0-9_@.+/-]+$/u.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..') || files.has(relative)) {
      throw new Error('CONVERSION_PACKAGE_PATH_INVALID');
    }
    total += bytes.length;
    if (files.size >= MAX_FILES || total > MAX_BYTES) throw new Error('CONVERSION_PACKAGE_LIMIT');
    files.set(relative, { relative, bytes, executable: relative === 'node' || relative === 'node.exe' });
  }
  function tree(source, relative, include = () => true) {
    const stat = fs.lstatSync(source);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('CONVERSION_PACKAGE_DIRECTORY_UNSAFE');
    for (const name of fs.readdirSync(source).sort()) {
      const target = path.join(source, name), destination = `${relative}/${name}`;
      if (!include(destination)) continue;
      const entry = fs.lstatSync(target);
      if (entry.isSymbolicLink()) throw new Error('CONVERSION_PACKAGE_LINK_UNSAFE');
      if (entry.isDirectory()) tree(target, destination, include);
      else add(destination, regularBytes(target));
    }
  }
  const pilot = path.join(root, 'native', 'ocr', 'pilot');
  const lock = JSON.parse(readRegular(path.join(pilot, 'package-lock.json'), 512 * 1024));
  const pending = ['tesseract.js', '@napi-rs/canvas', `@napi-rs/${binding}`], visited = new Set();
  while (pending.length) {
    const name = pending.pop();
    if (visited.has(name)) continue;
    visited.add(name);
    const relative = `node_modules/${name}`, source = path.join(pilot, ...relative.split('/'));
    const metadata = JSON.parse(readRegular(path.join(source, 'package.json'), 128 * 1024));
    const pin = lock.packages?.[relative];
    if (!pin || metadata.name !== name || metadata.version !== pin.version || !pin.integrity ||
        (PINNED[name] && metadata.version !== PINNED[name]) || (name === `@napi-rs/${binding}` && metadata.version !== '1.0.7')) {
      throw new Error('CONVERSION_PACKAGE_VERSION_INVALID');
    }
    pending.push(...Object.keys(metadata.dependencies || {}));
    packages.push({ name, version: metadata.version, license: metadata.license || 'NOASSERTION', integrity: pin.integrity });
    tree(source, relative, candidate => !/(?:^|\/)\.[^/]+/u.test(candidate) &&
      !/(?:^|\/)(?:test|tests|__test__|examples)(?:\/|$)/u.test(candidate) &&
      !candidate.endsWith('.map') && !(name === 'tesseract.js' && candidate.startsWith(`${relative}/dist`)));
  }
  const pdfPilot = path.join(root, 'native', 'pdfjs', 'pilot');
  const pdfLock = JSON.parse(readRegular(path.join(pdfPilot, 'package-lock.json'), 256 * 1024));
  const pdfSource = path.join(pdfPilot, 'node_modules', 'pdfjs-dist');
  const pdfPackage = JSON.parse(readRegular(path.join(pdfSource, 'package.json'), 64 * 1024));
  if (pdfPackage.version !== PINNED['pdfjs-dist'] || pdfLock.packages?.['node_modules/pdfjs-dist']?.version !== PINNED['pdfjs-dist']) {
    throw new Error('CONVERSION_PACKAGE_VERSION_INVALID');
  }
  packages.push({ name: 'pdfjs-dist', version: pdfPackage.version, license: pdfPackage.license,
    integrity: pdfLock.packages['node_modules/pdfjs-dist'].integrity });
  for (const relative of ['package.json', 'LICENSE', 'legacy/build/pdf.mjs', 'legacy/build/pdf.worker.mjs']) {
    const bytes = regularBytes(path.join(pdfSource, ...relative.split('/')));
    add(`node_modules/pdfjs-dist/${relative}`, bytes);
    if (relative === 'legacy/build/pdf.mjs') {
      // Keep upstream bytes/licence separately. This explicitly named and
      // inventoried derivative adds only our first-party text-paint probe.
      add('node_modules/pdfjs-dist/legacy/build/pdf.datasecure.mjs', derivePdfjsTextPaintModule(bytes));
    }
  }
  for (const directory of ['cmaps', 'standard_fonts', 'iccs', 'wasm']) tree(path.join(pdfSource, directory), `node_modules/pdfjs-dist/${directory}`);
  // Only the self-contained SVG-only browser entry is shipped. In particular
  // the Node entry and its optional newer Canvas peer never enter this runtime.
  const graphicsPilot=path.join(root,'native','graphics','pilot');
  const graphicsLock=JSON.parse(readRegular(path.join(graphicsPilot,'package-lock.json'),64*1024));
  const graphicsSource=path.join(graphicsPilot,'node_modules','emf-converter');
  const graphicsPackage=JSON.parse(readRegular(path.join(graphicsSource,'package.json'),128*1024));
  const graphicsPin=graphicsLock.packages?.['node_modules/emf-converter'];
  if(graphicsPackage.name!=='emf-converter'||graphicsPackage.version!=='4.18.1'||graphicsPin?.version!=='4.18.1'||
    graphicsPin.integrity!=='sha512-e/H8eBnj/QO8sWL2Yav02n58wWVo3GWYqFM2SqJh2bk9Prc2rgexPUSs8VV42GL5l/x49GaK/kPueCDW+j+6Sg=='||
    Object.keys(graphicsPackage.dependencies||{}).length||Object.keys(graphicsLock.packages).length!==2)throw new Error('CONVERSION_PACKAGE_VERSION_INVALID');
  packages.push({name:'emf-converter',version:'4.18.1',license:'Apache-2.0; bundled notices apply',integrity:graphicsPin.integrity});
  const graphicsContractBytes=readRegular(path.join(graphicsPilot,'runtime-contract.json'),64*1024);
  const graphicsContract=JSON.parse(graphicsContractBytes);
  if(graphicsContract.schema!=='datasecure-office-graphics/1'||graphicsContract.package!=='emf-converter'||graphicsContract.version!=='4.18.1'||
    graphicsContract.entry!=='dist/browser.js'||Object.keys(graphicsContract.files||{}).sort().join('|')!==['LICENSE','THIRD_PARTY_NOTICES','dist/browser.js','package.json'].sort().join('|'))throw new Error('CONVERSION_GRAPHICS_CONTRACT_INVALID');
  for(const relative of ['package.json','dist/browser.js','LICENSE','THIRD_PARTY_NOTICES']){
    const bytes=regularBytes(path.join(graphicsSource,...relative.split('/')));
    if(sha256(bytes)!==graphicsContract.files[relative])throw new Error('CONVERSION_GRAPHICS_SOURCE_CHANGED');
    add(`node_modules/emf-converter/${relative}`,bytes);
  }
  for(const [file,digest]of [[graphicsContract.font.file,graphicsContract.font.sha256],[graphicsContract.font.license,graphicsContract.font.license_sha256]]){
    if(!['LiberationSans-Regular.ttf','LICENSE_LIBERATION'].includes(file)||sha256(files.get(`node_modules/pdfjs-dist/standard_fonts/${file}`)?.bytes||Buffer.alloc(0))!==digest)throw new Error('CONVERSION_GRAPHICS_FONT_CHANGED');
  }
  add('office-graphics-contract.json',graphicsContractBytes);
  // Syntax readers belong exclusively to this isolated runtime. The sidecar
  // never resolves them from repo node_modules or fetches them on user devices.
  const syntaxPilot = path.join(root, 'native', 'markdown', 'pilot');
  const syntaxLock = JSON.parse(readRegular(path.join(syntaxPilot, 'package-lock.json'), 512 * 1024));
  if (Object.keys(syntaxLock.packages || {}).some(key => key.includes('/node_modules/'))) {
    // This bounded collector deliberately supports a flat pinned closure only.
    // Do not accidentally pick a different hoisted/transitive version.
    throw new Error('CONVERSION_PACKAGE_NESTED_DEPENDENCY_UNSUPPORTED');
  }
  const syntaxPending = ['mdast-util-from-markdown', 'parse5'], syntaxSeen = new Set();
  while (syntaxPending.length) {
    const name = syntaxPending.pop();
    if (syntaxSeen.has(name)) continue;
    syntaxSeen.add(name);
    const relative = `node_modules/${name}`, source = path.join(syntaxPilot, ...relative.split('/'));
    const metadata = JSON.parse(readRegular(path.join(source, 'package.json'), 128 * 1024));
    const pin = syntaxLock.packages?.[relative];
    if (!pin || metadata.name !== name || metadata.version !== pin.version || !pin.integrity ||
        !pin.resolved?.startsWith('https://registry.npmjs.org/') ||
        (PINNED[name] && metadata.version !== PINNED[name]) || packages.some(item => item.name === name)) {
      throw new Error('CONVERSION_PACKAGE_VERSION_INVALID');
    }
    if (typeof metadata.license !== 'string' || metadata.license === 'NOASSERTION' ||
        !fs.readdirSync(source).some(file => /^licen[sc]e(?:\..*)?$/iu.test(file))) {
      throw new Error('CONVERSION_PACKAGE_LICENSE_MISSING');
    }
    syntaxPending.push(...Object.keys(metadata.dependencies || {}));
    packages.push({ name, version: metadata.version, license: metadata.license, integrity: pin.integrity });
    tree(source, relative, candidate => !/(?:^|\/)\.[^/]+/u.test(candidate) &&
      !/(?:^|\/)(?:test|tests|__test__|examples)(?:\/|$)/u.test(candidate) && !candidate.endsWith('.map'));
  }
  const modelLockBytes = readRegular(path.join(pilot, 'models.lock.json'), 64 * 1024);
  const modelLock = JSON.parse(modelLockBytes);
  add('models.lock.json', modelLockBytes);
  for (const entry of [modelLock.models.deu, modelLock.models.eng, modelLock.license]) {
    if (!['deu.traineddata', 'eng.traineddata', 'LICENSE'].includes(entry.file)) throw new Error('CONVERSION_PACKAGE_MODEL_INVALID');
    const bytes = readRegular(path.join(pilot, 'models', entry.file), 16 * 1024 * 1024);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error('CONVERSION_PACKAGE_MODEL_INVALID');
    add(`models/${entry.file}`, bytes);
  }
  const contract = readStandaloneRuntimeContract(root), target = contract.targets.find(item => item.id === productTarget);
  const runtimeDir = path.join(root, 'dist', productTarget);
  const node = readRegular(path.join(runtimeDir, productTarget === 'windows-x64' ? 'datasecure-node.exe' : 'node'), 128 * 1024 * 1024);
  const license = readRegular(path.join(runtimeDir, 'LICENSE.node.txt'), 2 * 1024 * 1024);
  const evidence = JSON.parse(readRegular(path.join(runtimeDir, 'runtime-evidence.json'), 64 * 1024));
  verifyTargetEvidence(evidence, node, license, target, contract);
  const nodeFile = productTarget === 'windows-x64' ? 'node.exe' : 'node';
  add(nodeFile, node); add('LICENSE.node.txt', license);
  add('package.json', Buffer.from('{"name":"datasecure-standalone-conversion-runtime","private":true}\n'));
  packages.sort((a, b) => a.name.localeCompare(b.name));
  const inventory = [...files.values()].sort((a, b) => a.relative.localeCompare(b.relative)).map(file => ({
    path: file.relative, bytes: file.bytes.length, sha256: sha256(file.bytes), executable: file.executable
  }));
  add('RUNTIME.json', Buffer.from(`${JSON.stringify({ schema: 'datasecure-conversion-runtime/1', target: productTarget,
    node_file: nodeFile, node_version: contract.node_version,
    syntax_reader_contract: 'datasecure-markdown-syntax/1',
    office_graphics_contract: 'datasecure-office-graphics/1',
    pdf_text_paint_contract: 'datasecure-pdf-text-paint/1', pdf_text_paint_upstream: PDFJS_TEXT_PAINT_HOOK,
    packages, files: inventory }, null, 2)}\n`));
  add('THIRD_PARTY_NOTICES.txt', Buffer.from(`Offline Markdown conversion runtime\n\n${packages.map(item => `${item.name} ${item.version}: ${item.license}`).join('\n')}\n\nPDF.js: upstream pdf.mjs remains unchanged; pdf.datasecure.mjs is a DataSecure text-paint-observer derivative of precisely pinned ${PDFJS_TEXT_PAINT_HOOK.upstreamVersion} (${PDFJS_TEXT_PAINT_HOOK.upstreamSha256}), under the same upstream licence. NPM integrity identifies the upstream package, not this derivative. Both module hashes are listed in RUNTIME.json.\nTessdata fast 4.1.0: Apache-2.0 (models/LICENSE)\nNode.js: LICENSE.node.txt\nDependency license files remain beside each package.\n`));
  return [...files.values()].sort((a, b) => a.relative.localeCompare(b.relative));
}

export function writeConversionRuntime(repoRoot, destination, productTarget) {
  const files = collectConversionRuntime(repoRoot, productTarget);
  const output = path.resolve(destination);
  if (fs.existsSync(output)) throw new Error('CONVERSION_PACKAGE_DESTINATION_EXISTS');
  fs.mkdirSync(output, { recursive: true });
  const macosBundle = productTarget.startsWith('macos-');
  if (macosBundle) fs.chmodSync(output, 0o755);
  for (const file of files) {
    const target = path.join(output, ...file.relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (macosBundle) {
      for (let directory = path.dirname(target); directory !== output; directory = path.dirname(directory)) {
        fs.chmodSync(directory, 0o755);
      }
    }
    const mode = macosBundle ? (file.executable ? 0o755 : 0o644) :
      (file.executable && process.platform !== 'win32' ? 0o700 : 0o600);
    fs.writeFileSync(target, file.bytes, { flag: 'wx', mode });
    if (macosBundle) fs.chmodSync(target, mode);
  }
  return files.map(file => ({ relative: file.relative, bytes: file.bytes.length }));
}
