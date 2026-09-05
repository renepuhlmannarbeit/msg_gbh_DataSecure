import fs from 'node:fs';
import path from 'node:path';

const prefix = '.tmp-standalone-package-';
const failure = () => new Error('STANDALONE_SMOKE_CLEANUP_UNSAFE');
const comparable = (value) => {
  let result = value;
  if (process.platform === 'win32') {
    if (result.startsWith('\\\\?\\UNC\\')) result = `\\\\${result.slice(8)}`;
    else if (result.startsWith('\\\\?\\')) result = result.slice(4);
    result = result.toLowerCase();
  }
  return path.resolve(result);
};

function checkedEntry(target) {
  const named = fs.lstatSync(target, { bigint: true });
  if (named.isSymbolicLink() || (!named.isDirectory() && !named.isFile())) throw failure();
  // Junctions/symlinks are rejected before realpath or directory enumeration.
  // Also reject redirected ancestry and unsupported directory redirection.
  if (comparable(fs.realpathSync.native(target)) !== comparable(target)) throw failure();
  return { target, directory: named.isDirectory(), dev: named.dev, ino: named.ino, birthtimeNs: named.birthtimeNs };
}

function checkedScope(parent, directory) {
  const base = path.resolve(parent);
  const target = path.resolve(directory);
  if (target !== directory || path.dirname(target) !== base || !path.basename(target).startsWith(prefix) ||
      path.basename(target).length <= prefix.length) throw failure();
  if (!checkedEntry(base).directory || !checkedEntry(target).directory) throw failure();
  return target;
}

export function isolatedSidecarEnvironment(parent, directory, inherited = process.env) {
  const scope = checkedScope(parent, directory);
  const locations = {
    USERPROFILE: 'Daten', HOME: 'Daten', LOCALAPPDATA: 'Daten/Local', APPDATA: 'Daten/Roaming',
    XDG_DATA_HOME: 'Daten/Xdg', TEMP: 'Temp', TMP: 'Temp', TMPDIR: 'Temp',
    DATASECURE_STANDALONE_DOCUMENTS_DIR: 'Daten/Documents',
    DATASECURE_STANDALONE_DIAGNOSTIC_DIR: 'Logs'
  };
  const environment = { PATH: '' };
  for (const key of ['SystemRoot', 'WINDIR', 'ComSpec']) if (inherited[key]) environment[key] = inherited[key];
  for (const [key, relative] of Object.entries(locations)) {
    const target = path.join(scope, relative);
    fs.mkdirSync(target, { recursive: true });
    if (!checkedEntry(target).directory) throw failure();
    environment[key] = target;
  }
  return environment;
}

export function removePackageSmokeScope(parent, directory) {
  const scope = checkedScope(parent, directory);
  const entries = [checkedEntry(scope)];
  for (let position = 0; position < entries.length; position += 1) {
    const entry = entries[position];
    if (!entry.directory) continue;
    // Inspect before descent; no recursive rm/readdir or link following.
    for (const name of fs.readdirSync(entry.target)) {
      const target = path.join(entry.target, name);
      const relative = path.relative(scope, target);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw failure();
      entries.push(checkedEntry(target));
    }
  }
  // Nothing is removed until the complete tree has passed inspection. Recheck
  // each identity before its individual unlink/rmdir; locks/errors stop cleanup.
  for (const entry of entries.reverse()) {
    const current = checkedEntry(entry.target);
    if (current.directory !== entry.directory || current.dev !== entry.dev || current.ino !== entry.ino ||
        current.birthtimeNs !== entry.birthtimeNs) throw failure();
    if (entry.directory) fs.rmdirSync(entry.target);
    else fs.unlinkSync(entry.target);
  }
}
