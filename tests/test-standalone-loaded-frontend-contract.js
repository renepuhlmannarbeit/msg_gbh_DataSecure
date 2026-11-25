'use strict';

// RC178 review R-019. The network and DOM-sink assertions of the desktop
// contract test once read frontend/app.js, an earlier interface that the main
// window no longer loaded; it has since been removed. This test starts at the
// window configuration, follows the documents and scripts the shipped windows
// really load, and applies the closed rules to exactly those files. It also
// holds that nothing else lies in the packaged frontend folder. It is a
// source contract: it proves the absence of a construct, not behaviour in a
// WebView.
const fs = require('node:fs');
const path = require('node:path');
const { createSuite } = require('./helpers');
const { test, assert, done } = createSuite('Standalone loaded frontend contract');

const frontend = path.join(__dirname, '../apps/datasecure-standalone/frontend');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../apps/datasecure-standalone/tauri-contract/tauri.conf.json'), 'utf8'));
const read = (name) => fs.readFileSync(path.join(frontend, name), 'utf8');
const localName = (value) => /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:html|js|css)$/u.test(value);

function references(html) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)].map(([, attributes, body]) => ({
    src: /\bsrc="([^"]*)"/u.exec(attributes)?.[1], body }));
  const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]*)"/giu)].map((match) => match[1]);
  return { scripts, styles };
}

const entry = config.app.windows.map((window) => window.url);
const documents = new Set(entry);
// The review document is loaded into the workspace by its fixed name.
for (const name of [...documents]) {
  for (const match of read(name).matchAll(/["']([A-Za-z0-9._-]+\.html)["']/gu)) documents.add(match[1]);
  for (const script of references(read(name)).scripts) {
    if (script.src) for (const match of read(script.src).matchAll(/["']([A-Za-z0-9._-]+\.html)(?:\?[^"']*)?["']/gu)) documents.add(match[1]);
  }
}
const loadedScripts = new Set(), loadedStyles = new Set();
for (const name of documents) {
  const { scripts, styles } = references(read(name));
  for (const script of scripts) if (script.src) loadedScripts.add(script.src);
  for (const style of styles) loadedStyles.add(style);
}

test('the configured window loads the workspace and, through it, the review document', () => {
  assert.deepEqual(entry, ['workspace.html']);
  assert.ok(documents.has('review.html'), 'the embedded review is part of the loaded surface');
  assert.ok(!documents.has('index.html'), 'the earlier interface is not referenced by the loaded surface');
  assert.deepEqual([...loadedScripts].sort(),
    ['document-review.js', 'review.js', 'text-positions.js', 'workflow-presentation.js', 'workspace.js']);
  assert.ok(!loadedScripts.has('app.js'), 'assertions about app.js say nothing about the shipped window');
});

test('the packaged frontend folder holds only what the shipped windows load', () => {
  // Tauri embeds the whole folder. A page or script that no window loads is
  // still shipped, keeps its access to the native commands and is tested by
  // nobody who uses the product; the earlier interface was such a page.
  const fonts = fs.readdirSync(path.join(frontend, 'fonts')).sort();
  assert.deepEqual(fonts, ['InterVariable.woff2', 'LICENSE-Inter.txt']);
  const packaged = fs.readdirSync(frontend, { withFileTypes: true });
  assert.deepEqual(packaged.filter((entry) => entry.isDirectory()).map((entry) => entry.name), ['fonts']);
  assert.deepEqual(packaged.filter((entry) => entry.isFile()).map((entry) => entry.name).sort(),
    [...documents, ...loadedScripts, ...loadedStyles].sort());
});

test('loaded documents reference only local files and carry no inline script or handler', () => {
  for (const name of documents) {
    const html = read(name), { scripts, styles } = references(html);
    for (const script of scripts) {
      assert.ok(script.src && localName(script.src), `${name}: script source ${script.src}`);
      assert.equal(script.body.trim(), '', `${name}: inline script`);
      assert.ok(fs.statSync(path.join(frontend, script.src)).isFile());
    }
    for (const style of styles) {
      assert.ok(localName(style), `${name}: stylesheet ${style}`);
      assert.ok(fs.statSync(path.join(frontend, style)).isFile());
    }
    assert.doesNotMatch(html, /\son[a-z]+\s*=/iu, `${name}: inline event handler`);
    // The only embedded surface is the review frame; it starts empty and
    // receives the local review document from the workspace script.
    const withoutEmptyFrame = html.replace('<iframe id="review-frame" title="Fundstellen gemeinsam prüfen" src="about:blank">', '<iframe id="review-frame">');
    if (name === 'workspace.html') assert.notEqual(withoutEmptyFrame, html, 'the workspace keeps its empty review frame');
    assert.doesNotMatch(withoutEmptyFrame, /(?:src|href|action|data)\s*=\s*["'](?:[a-z][a-z0-9+.-]*:|\/\/)/iu, `${name}: non-local reference`);
    assert.doesNotMatch(withoutEmptyFrame, /<(?:iframe|object|embed|base|form)\b[^>]*\b(?:src|data|href|action)\s*=/iu, `${name}: embedded external surface`);
    assert.match(html, /<html lang="de">/u, `${name}: document language`);
  }
});

test('loaded scripts have no network API, no HTML-string sink and no dynamic code', () => {
  const forbidden = [
    [/\bfetch\s*\(/u, 'fetch'], [/\bXMLHttpRequest\b/u, 'XMLHttpRequest'], [/\bWebSocket\b/u, 'WebSocket'],
    [/\bEventSource\b/u, 'EventSource'], [/\bsendBeacon\b/u, 'sendBeacon'], [/\bnavigator\.serviceWorker\b/u, 'service worker'],
    [/\.innerHTML\b/u, 'innerHTML'], [/\.outerHTML\b/u, 'outerHTML'], [/\binsertAdjacentHTML\b/u, 'insertAdjacentHTML'],
    [/\bdocument\.write\b/u, 'document.write'], [/\beval\s*\(/u, 'eval'], [/\bnew\s+Function\b/u, 'Function constructor'],
    [/\bimport\s*\(/u, 'dynamic import'], [/\bimportScripts\b/u, 'importScripts'],
    [/["'`](?:https?|wss?|ftp):\/\//iu, 'absolute network address'], [/\bsource_paths?\b|\braw_content\b/u, 'renderer-side source path']
  ];
  for (const name of loadedScripts) {
    const source = read(name);
    for (const [pattern, label] of forbidden) assert.doesNotMatch(source, pattern, `${name}: ${label}`);
  }
});

test('loaded stylesheets load nothing from outside the package', () => {
  for (const name of loadedStyles) {
    const css = read(name);
    assert.doesNotMatch(css, /@import\b/iu, `${name}: @import`);
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/giu)) {
      assert.ok(/^(?:fonts\/)?[A-Za-z0-9._-]+$/u.test(match[1]) || match[1].startsWith('data:'), `${name}: url(${match[1]})`);
    }
  }
});

done();
