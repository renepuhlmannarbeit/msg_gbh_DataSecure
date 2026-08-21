import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyNativeArtifact } from './lib/native-artifact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = path.join(root, 'native', 'pdfium', 'pdfium-spike.lock.json');
const sourcePath = path.join(root, 'native', 'windows', 'datasecure-pdfium-probe.cpp');
const maxDownloadBytes = 10 * 1024 * 1024;
const pinnedDistribution = Object.freeze({
  repository: 'bblanchon/pdfium-binaries',
  tag: 'chromium/8009',
  asset: 'pdfium-win-x64.tgz',
  url: 'https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/8009/pdfium-win-x64.tgz'
});
const pinnedUpstreamRefUrl =
  'https://pdfium.googlesource.com/pdfium/+/refs/heads/chromium/8009?format=JSON';

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function readAndValidateLock() {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  invariant(lock.schema_version === 1, 'unsupported PDFium spike lock schema');
  invariant(lock.purpose === 'engineering-spike-only', 'PDFium lock purpose must remain spike-only');
  invariant(lock.release_enabled === false, 'PDFium must not be release-enabled by the spike lock');
  invariant(lock.distribution?.affiliation === 'unofficial-third-party',
    'unofficial distribution provenance must be explicit');
  for (const [field, expected] of Object.entries(pinnedDistribution)) {
    invariant(lock.distribution?.[field] === expected, `unexpected pinned distribution ${field}`);
  }
  invariant(/^[a-f0-9]{40}$/.test(String(lock.distribution?.commit || '')),
    'invalid distribution commit');
  invariant(/^[a-f0-9]{64}$/.test(String(lock.distribution?.sha256 || '')),
    'invalid distribution sha256');
  invariant(/^[a-f0-9]{40}$/.test(String(lock.upstream?.commit || '')), 'invalid upstream commit');
  invariant(Number.isSafeInteger(lock.distribution?.bytes) && lock.distribution.bytes > 0 &&
    lock.distribution.bytes <= maxDownloadBytes, 'invalid distribution size');
  invariant(Number.isSafeInteger(lock.payload?.dll_bytes) && lock.payload.dll_bytes > 0,
    'invalid PDFium DLL size');
  invariant(/^[a-f0-9]{64}$/.test(String(lock.payload?.dll_sha256 || '')), 'invalid DLL hash');
  invariant(Array.isArray(lock.required_notices) && lock.required_notices.length >= 10,
    'third-party notice inventory is incomplete');
  for (const field of ['listing_sha256', 'manifest_sha256', 'version_sha256', 'args_sha256']) {
    invariant(/^[a-f0-9]{64}$/.test(String(lock.payload?.[field] || '')), `invalid payload ${field}`);
  }
  invariant(lock.attestation?.workflow_commit === lock.distribution.commit,
    'attestation and distribution commits differ');
  const url = new URL(lock.distribution.url);
  invariant(url.protocol === 'https:' && url.hostname === 'github.com', 'unexpected PDFium asset URL');
  invariant(url.pathname.endsWith(`/${lock.distribution.asset}`), 'asset URL/name mismatch');
  const contract = lock.build_contract || {};
  invariant(contract.target_os === 'win' && contract.target_cpu === 'x64', 'unexpected PDFium target');
  invariant(contract.is_component_build === false && contract.is_debug === false,
    'debug/component PDFium build is not allowed');
  invariant(contract.pdf_enable_v8 === false && contract.pdf_enable_xfa === false,
    'PDFium V8 and XFA must be disabled');
  return lock;
}

function downloadPinnedAsset(lock, destination) {
  invariant(!fs.existsSync(destination), 'PDFium destination already exists');
  run('gh.exe', ['release', 'download', pinnedDistribution.tag,
    '--repo', pinnedDistribution.repository, '--pattern', pinnedDistribution.asset,
    '--dir', path.dirname(destination)]);
  invariant(fs.existsSync(destination), 'PDFium release download produced no locked asset');
  const bytes = fs.readFileSync(destination);
  invariant(bytes.length === lock.distribution.bytes, 'PDFium asset size differs from lock');
  invariant(sha256(bytes) === lock.distribution.sha256, 'PDFium asset hash differs from lock');
}

async function verifyRemoteProvenance(lock, assetPath) {
  const attested = JSON.parse(run('gh.exe', ['attestation', 'verify', assetPath,
    '--repo', lock.attestation.repository, '--format', 'json']).stdout);
  invariant(Array.isArray(attested) && attested.length === 1, 'unexpected PDFium attestation count');
  const verification = attested[0]?.verificationResult;
  const identity = verification?.signature?.certificate;
  const statement = verification?.statement;
  invariant(identity?.githubWorkflowRepository === lock.attestation.repository,
    'PDFium attestation repository differs from lock');
  invariant(identity?.githubWorkflowSHA === lock.attestation.workflow_commit,
    'PDFium attestation workflow commit differs from lock');
  invariant(identity?.githubWorkflowRef === lock.attestation.workflow_ref,
    'PDFium attestation workflow ref differs from lock');
  invariant(identity?.buildConfigURI?.includes(`/${lock.attestation.workflow}@`),
    'PDFium attestation workflow path differs from lock');
  invariant(identity?.runnerEnvironment === lock.attestation.runner_environment,
    'PDFium attestation runner differs from lock');
  invariant(identity?.buildTrigger === lock.attestation.build_trigger,
    'PDFium attestation trigger differs from lock');
  invariant(statement?.predicate?.runDetails?.metadata?.invocationId === lock.attestation.invocation,
    'PDFium attestation invocation differs from lock');
  const subject = statement?.subject?.find((entry) => entry.name === lock.distribution.asset);
  invariant(subject?.digest?.sha256 === lock.distribution.sha256,
    'PDFium attestation does not cover the locked asset digest');

  const upstreamResponse = await fetch(
    pinnedUpstreamRefUrl,
    { redirect: 'error', signal: AbortSignal.timeout(20000) });
  invariant(upstreamResponse.ok, `official PDFium ref lookup failed with HTTP ${upstreamResponse.status}`);
  const upstreamText = await upstreamResponse.text();
  invariant(upstreamText.startsWith(")]}'"), 'unexpected official PDFium ref response');
  const upstream = JSON.parse(upstreamText.slice(upstreamText.indexOf('\n') + 1));
  invariant(upstream.commit === lock.upstream.commit, 'official PDFium branch head differs from lock');
  const tag = run('gh.exe', ['api', `repos/${lock.distribution.repository}/git/ref/tags/${lock.distribution.tag}`,
    '--jq', '.object.sha']).stdout.trim();
  invariant(tag === lock.distribution.commit, 'PDFium distributor tag differs from lock');
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: root,
    encoding: options.encoding ?? 'utf8',
    windowsHide: true,
    shell: false,
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
    ...options
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed (${result.status ?? 'spawn'}): ${result.error?.message || ''}\n` +
      `${String(result.stdout || '')}${String(result.stderr || '')}`);
  }
  return result;
}

function inspectAndExtract(lock, assetPath, extractPath) {
  const rawListing = run('tar.exe', ['-tzf', assetPath]).stdout.replaceAll('\r\n', '\n');
  const listing = rawListing.trim().split('\n').filter(Boolean);
  invariant(listing.length === lock.payload.archive_entry_count,
    'PDFium archive entry count differs from lock');
  invariant(sha256(Buffer.from(`${listing.join('\n')}\n`, 'utf8')) === lock.payload.listing_sha256,
    'PDFium archive listing differs from lock');
  invariant(new Set(listing).size === listing.length, 'PDFium archive contains duplicate entries');
  for (const entry of listing) {
    const normalized = entry.replaceAll('\\', '/');
    invariant(entry === normalized && !path.posix.isAbsolute(normalized) &&
      !normalized.split('/').includes('..') && !normalized.includes(':'),
    `unsafe PDFium archive entry: ${entry}`);
  }
  const verbose = run('tar.exe', ['-tvzf', assetPath]).stdout.trim().split(/\r?\n/).filter(Boolean);
  invariant(verbose.length === listing.length && verbose.every((line) => line.startsWith('-') || line.startsWith('d')),
    'PDFium archive contains links or unsupported entry types');
  fs.mkdirSync(extractPath, { recursive: false });
  run('tar.exe', ['-xzf', assetPath, '-C', extractPath]);

  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      invariant(!entry.isSymbolicLink(), 'PDFium extraction produced a symbolic link');
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(full);
      else throw new Error('PDFium extraction produced an unsupported filesystem object');
    }
  };
  visit(extractPath);
  files.sort((a, b) => a.localeCompare(b, 'en'));
  const extractedBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  invariant(files.length === lock.payload.file_count && extractedBytes === lock.payload.extracted_bytes,
    'PDFium extracted payload differs from lock');
  const manifest = files.map((file) => {
    const bytes = fs.readFileSync(file);
    const relative = path.relative(extractPath, file).replaceAll('\\', '/');
    return `${relative}\0${bytes.length}\0${sha256(bytes)}\n`;
  }).join('');
  const manifestHash = sha256(Buffer.from(manifest, 'utf8'));
  invariant(manifestHash === lock.payload.manifest_sha256,
    `PDFium extracted manifest differs from lock (${manifestHash})`);
  const dllPath = path.join(extractPath, 'bin', 'pdfium.dll');
  const dll = fs.readFileSync(dllPath);
  invariant(dll.length === lock.payload.dll_bytes && sha256(dll) === lock.payload.dll_sha256,
    'PDFium DLL differs from lock');
  for (const notice of lock.required_notices) {
    const noticePath = path.resolve(extractPath, ...notice.split('/'));
    invariant(noticePath.startsWith(`${path.resolve(extractPath)}${path.sep}`) &&
      fs.statSync(noticePath).isFile() && fs.statSync(noticePath).size > 0,
    `missing PDFium notice: ${notice}`);
  }

  const argsBytes = fs.readFileSync(path.join(extractPath, 'args.gn'));
  const versionBytes = fs.readFileSync(path.join(extractPath, 'VERSION'));
  invariant(sha256(argsBytes) === lock.payload.args_sha256 &&
    sha256(versionBytes) === lock.payload.version_sha256,
  'PDFium VERSION or args.gn differs from lock');
  const args = argsBytes.toString('utf8');
  for (const [name, value] of Object.entries(lock.build_contract)) {
    const expected = typeof value === 'string' ? `"${value}"` : String(value);
    invariant(new RegExp(`^${name}\\s*=\\s*${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(args),
      `PDFium args.gn does not prove ${name}=${expected}`);
  }
  const version = Object.fromEntries(versionBytes.toString('utf8')
    .trim().split(/\r?\n/).map((line) => line.split('=')));
  invariant(`${version.MAJOR}.${version.MINOR}.${version.BUILD}.${version.PATCH}` === lock.upstream.version,
    'PDFium VERSION differs from lock');
  return { dllPath, includePath: path.join(extractPath, 'include'), libPath: path.join(extractPath, 'lib') };
}

function discoverVcvars() {
  const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  invariant(fs.existsSync(vswhere), 'Visual Studio Build Tools discovery is unavailable');
  const found = run(vswhere, ['-latest', '-products', '*',
    '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath']);
  const installation = found.stdout.trim();
  invariant(installation, 'Visual C++ x64 build tools are unavailable');
  return path.join(installation, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat');
}

function runDeveloperCommand(vcvars, command) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return run(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
    ['/d', '/c', `call ${quote(vcvars)} x64 >nul && ${command}`], {
      windowsVerbatimArguments: true
    });
}

function inspectPe(lock, dllPath, vcvars) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const headers = runDeveloperCommand(vcvars, `dumpbin /headers ${quote(dllPath)}`).stdout;
  invariant(headers.includes(`${lock.pe_contract.machine} machine (x64)`), 'PDFium DLL is not AMD64');
  for (const marker of lock.pe_contract.required_hardening) {
    invariant(headers.includes(marker), `PDFium DLL lacks ${marker}`);
  }
  invariant(/\b0\s+\[\s*0\]\s+RVA \[size\] of Delay Import Directory/.test(headers),
    'PDFium DLL has unexpected delay imports');
  const imports = runDeveloperCommand(vcvars, `dumpbin /imports ${quote(dllPath)}`).stdout;
  const importedDlls = [...imports.matchAll(/^\s{4}([A-Za-z0-9_.-]+\.dll)\s*$/gim)]
    .map((match) => match[1].toUpperCase()).sort();
  const expectedDlls = lock.pe_contract.imported_dlls.map((name) => name.toUpperCase()).sort();
  invariant(JSON.stringify(importedDlls) === JSON.stringify(expectedDlls),
    `PDFium DLL import set differs from lock: ${importedDlls.join(',')}`);
  const exports = runDeveloperCommand(vcvars, `dumpbin /exports ${quote(dllPath)}`).stdout;
  for (const symbol of lock.pe_contract.required_exports) {
    invariant(new RegExp(`\\b${symbol}\\b`).test(exports), `PDFium DLL lacks export ${symbol}`);
  }
}

function compileProbe(payload, outputPath, vcvars) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const objectPath = `${outputPath}.obj`;
  const command = [
    'call', quote(vcvars), 'x64', '>nul', '&&', 'cl.exe', '/nologo', '/std:c++17', '/O2', '/MT', '/EHsc',
    '/W4', '/WX', '/sdl', '/guard:cf', '/DUNICODE', '/D_UNICODE',
    `/I${quote(payload.includePath)}`, `/Fe:${quote(outputPath)}`, `/Fo:${quote(objectPath)}`,
    quote(sourcePath), '/link', `/LIBPATH:${quote(payload.libPath)}`, 'pdfium.dll.lib',
    '/SUBSYSTEM:CONSOLE', '/guard:cf', '/CETCOMPAT', '/DYNAMICBASE', '/NXCOMPAT', '/HIGHENTROPYVA'
  ].join(' ');
  run(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', ['/d', '/c', command],
    { windowsVerbatimArguments: true });
  invariant(fs.existsSync(outputPath), 'PDFium probe compiler produced no executable');
}

function makePdf({ content, pageExtra = '', catalogExtra = '', extraObjects = [] }) {
  const stream = Buffer.from(content, 'ascii');
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${catalogExtra} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ` +
      `/Resources << /Font << /F1 5 0 R >> >> ${pageExtra} >>`,
    `<< /Length ${stream.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...extraObjects
  ];
  let body = '%PDF-1.7\n%DS00\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(body, 'ascii'));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, 'ascii');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'ascii');
}

function runProbe(launcher, executable, pdf) {
  const result = childProcess.spawnSync(launcher, [
    '--memory-mib', '768', '--cpu-ms', '40000', '--wall-ms', '45000', '--', executable, '--spike'
  ], {
    cwd: path.dirname(executable), input: pdf, encoding: 'utf8', windowsHide: true,
    shell: false, maxBuffer: 1024 * 1024, timeout: 50000, env: {}
  });
  invariant(!result.error, `PDFium probe failed to start: ${result.error?.message || ''}`);
  invariant(result.status === 0 || result.status === 2, `PDFium probe returned ${result.status}`);
  invariant(String(result.stderr || '') === '', 'PDFium probe wrote to stderr');
  const parsed = JSON.parse(String(result.stdout || '').trim());
  invariant(!String(result.stdout).includes('Alice') && !String(result.stdout).includes('example.invalid'),
    'PDFium probe leaked document text');
  return parsed;
}

export async function runSpike() {
  const lock = readAndValidateLock();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-pdfium-spike-'));
  try {
    const assetPath = path.join(temporary, lock.distribution.asset);
    downloadPinnedAsset(lock, assetPath);
    await verifyRemoteProvenance(lock, assetPath);
    const payload = inspectAndExtract(lock, assetPath, path.join(temporary, 'payload'));
    const vcvars = discoverVcvars();
    inspectPe(lock, payload.dllPath, vcvars);
    const executable = path.join(temporary, 'datasecure-pdfium-probe.exe');
    compileProbe(payload, executable, vcvars);
    fs.copyFileSync(payload.dllPath, path.join(temporary, 'pdfium.dll'));
    const launcher = path.join(root, 'plugins', 'data-secure', 'bin', 'windows-x64',
      'datasecure-sandbox.exe');
    verifyNativeArtifact(launcher, launcher.slice(0, -4) + '.sha256');

    const cases = {
      text_only: runProbe(launcher, executable, makePdf({
        content: 'BT /F1 12 Tf 72 720 Td (Alice Example) Tj 0 -20 Td (alice@example.invalid) Tj ET'
      })),
      path_object: runProbe(launcher, executable, makePdf({ content: '0 0 m 100 100 l S' })),
      annotation: runProbe(launcher, executable, makePdf({
        content: 'BT /F1 12 Tf 72 720 Td (Review) Tj ET',
        pageExtra: '/Annots [6 0 R]',
        extraObjects: ['<< /Type /Annot /Subtype /Text /Rect [0 0 10 10] /Contents (hidden) >>']
      })),
      javascript: runProbe(launcher, executable, makePdf({
        content: 'BT /F1 12 Tf 72 720 Td (Review) Tj ET',
        catalogExtra: '/Names << /JavaScript << /Names [(Script) 6 0 R] >> >>',
        extraObjects: ['<< /S /JavaScript /JS (app.alert(1)) >>']
      })),
      malformed: runProbe(launcher, executable, Buffer.from('%PDF-1.7\nnot-a-document\n', 'ascii'))
    };
    invariant(cases.text_only.status === 'text_only_candidate', 'text-only PDF was not recognized');
    for (const name of ['path_object', 'annotation', 'javascript', 'malformed']) {
      invariant(cases[name].status === 'stopped', `${name} PDF did not stop`);
    }
    return {
      schema_version: 1,
      release_decision: 'no_go',
      product_pdf_gate: 'PDF_COVERAGE_UNVERIFIED',
      provenance: {
        distribution_tag: lock.distribution.tag,
        distribution_commit: lock.distribution.commit,
        upstream_commit: lock.upstream.commit,
        asset_sha256: lock.distribution.sha256,
        dll_sha256: lock.payload.dll_sha256
      },
      footprint: {
        compressed_bytes: lock.distribution.bytes,
        extracted_bytes: lock.payload.extracted_bytes,
        dll_bytes: lock.payload.dll_bytes
      },
      probe_codes: Object.fromEntries(Object.entries(cases).map(([name, value]) => [name, value.code])),
      passed_engineering_checks: [
        'pinned-download', 'github-attestation', 'official-branch-head-check',
        'archive-path-link-duplicate-and-manifest-validation', 'v8-and-xfa-disabled',
        'pe-hardening-import-and-export-validation',
        'license-inventory-present', 'memory-input', 'job-object-launch', 'text-only-positive-control',
        'path-object-negative-control', 'annotation-negative-control',
        'javascript-negative-control', 'malformed-negative-control', 'content-free-probe-output'
      ],
      release_blockers: [
        'unofficial-third-party-binary', 'self-build-reproducibility-not-proven',
        'full-action-and-catalog-coverage-not-proven', 'encrypted-and-custom-unicode-corpus-missing',
        'object-stream-and-form-xobject-corpus-missing', 'appcontainer-boundary-not-proven',
        'static-link-or-dll-loading-policy-undecided', 'legal-approval-missing',
        'fresh-windows-vm-gate-missing', 'fuzz-and-sanitizer-gates-missing'
      ]
    };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] || '--verify-lock';
  if (mode === '--verify-lock') {
    const lock = readAndValidateLock();
    console.log(JSON.stringify({
      schema_version: lock.schema_version,
      purpose: lock.purpose,
      release_enabled: lock.release_enabled,
      upstream_commit: lock.upstream.commit,
      asset_sha256: lock.distribution.sha256
    }, null, 2));
  } else if (mode === '--run') {
    console.log(JSON.stringify(await runSpike(), null, 2));
  } else {
    throw new Error('use --verify-lock or --run explicitly');
  }
}
