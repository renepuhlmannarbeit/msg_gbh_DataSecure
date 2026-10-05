'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { projectStartResult } = require('./model');
const { readBoundFile, bindDirectory, assertDirectory } = require('../core/bound-file-io');

const RESOURCE_URI = 'ui://data-secure/status-card-v1.html';
const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';
const MAX_HTML_BYTES = 768 * 1024;
const MAX_MANIFEST_BYTES = 16 * 1024;
const START_TOOL = 'start_document_batch_from_picker';

function resourceMetadata() {
  return { ui: {
    prefersBorder: true,
    permissions: {},
    csp: { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] }
  } };
}

// Only package-owned, literal filenames can reach this reader. Descriptor and
// identity checks reject links/replacements before reading bounded file bytes.
function readRegularFile(directory, filename, maximum, fsApi, binding) {
  const target = path.join(directory, filename);
  return readBoundFile(target, { io: fsApi, directory: binding, minimum: 1, maximum, checkCtime: true });
}

function verifiedHtml(directory, fsApi) {
  const binding = bindDirectory(directory, { io: fsApi });
  const manifest = JSON.parse(readRegularFile(directory, 'artifact.json', MAX_MANIFEST_BYTES, fsApi, binding).toString('utf8'));
  if (!manifest || Object.keys(manifest).sort().join(',') !== 'bytes,release_enabled,schema,sdk_version,sha256' ||
      manifest.schema !== 'datasecure-status-app-artifact/v1' || manifest.sdk_version !== '1.7.5' ||
      manifest.release_enabled !== false || !Number.isSafeInteger(manifest.bytes) ||
      manifest.bytes < 1 || manifest.bytes > MAX_HTML_BYTES || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error('Invalid UI manifest');
  const bytes = readRegularFile(directory, 'status-card.html', MAX_HTML_BYTES, fsApi, binding);
  if (bytes.length !== manifest.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error('UI integrity mismatch');
  const html = bytes.toString('utf8');
  if (!Buffer.from(html, 'utf8').equals(bytes)) throw new Error('Invalid UI encoding');
  assertDirectory(binding);
  return html;
}

function createStatusApp({ env = process.env, directory = __dirname, fsApi = fs } = {}) {
  const pilotAllowed = env.EU_PRIVACY_STATUS_APP_PILOT === '1' && env.EU_PRIVACY_SUPPORT_MODE !== '1';
  const locale = env.EU_PRIVACY_LANGUAGE === 'en' ? 'en' : 'de';
  let initialized = false;
  let html = null;
  return Object.freeze({
    initialize(capabilities) {
      // No renegotiation/escalation by later initialize or discovery messages.
      if (initialized) return html !== null;
      initialized = true;
      const mimeTypes = capabilities?.extensions?.['io.modelcontextprotocol/ui']?.mimeTypes;
      if (!pilotAllowed || !Array.isArray(mimeTypes) || !mimeTypes.includes(RESOURCE_MIME_TYPE)) return false;
      try { html = verifiedHtml(directory, fsApi); } catch { html = null; }
      return html !== null;
    },
    capabilities() {
      return html === null ? {} : { resources: { subscribe: false, listChanged: false } };
    },
    tools(tools) {
      if (html === null) return tools;
      return tools.map((tool) => ({
        ...tool,
        _meta: { ...(tool._meta || {}), ui: {
          visibility: ['model'],
          ...(tool.name === START_TOOL ? { resourceUri: RESOURCE_URI } : {})
        } }
      }));
    },
    listResources() {
      if (html === null) return null;
      return { resources: [{
        uri: RESOURCE_URI, name: 'DataSecure local start snapshot',
        mimeType: RESOURCE_MIME_TYPE, _meta: resourceMetadata()
      }] };
    },
    readResource(uri) {
      // Never parse or resolve the caller-supplied URI as a filesystem path.
      if (html === null || uri !== RESOURCE_URI) return null;
      return { contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: resourceMetadata() }] };
    },
    toolResult(name, result) {
      if (html === null || name !== START_TOOL) return result;
      try {
        return { ...result, _meta: { ...(result._meta || {}), 'datasecure/status': projectStartResult(result.structuredContent, locale) } };
      } catch {
        // A presentation failure must never change the existing text workflow.
        return result;
      }
    }
  });
}

module.exports = { createStatusApp, RESOURCE_URI, RESOURCE_MIME_TYPE, MAX_HTML_BYTES };
