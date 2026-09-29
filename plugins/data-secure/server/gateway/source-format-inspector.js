'use strict';

const fs = require('fs');
const path = require('path');
const { inspectZipDirectoryFromFd, ZipError } = require('../zip-reader');
const { validateOpcControls, OpcValidationError } = require('./opc-source-validator');

const PILOT_TYPES = new Set(['txt', 'md', 'csv', 'docx']);
const EXTENSION_TYPES = Object.freeze({
  '.txt': 'txt', '.md': 'md', '.markdown': 'md', '.csv': 'csv',
  '.docx': 'docx', '.xlsx': 'xlsx', '.pptx': 'pptx', '.pdf': 'pdf',
  '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.bmp': 'bmp'
});
const CFB = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

class SourceFormatError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SourceFormatError';
    this.code = code;
  }
}

function exactRead(fd, length, position, readSync) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    let count;
    try { count = readSync(fd, buffer, offset, length - offset, position + offset); }
    catch { throw new SourceFormatError('SOURCE_READ_FAILED'); }
    if (!Number.isSafeInteger(count) || count <= 0 || count > length - offset) {
      throw new SourceFormatError('SOURCE_READ_FAILED');
    }
    offset += count;
  }
  return buffer;
}

function sameIdentity(actual, expected) {
  if (!actual || typeof actual.isFile !== 'function' || !actual.isFile()) return false;
  // DS-070: ctime is no identity feature (scanner metadata writes alter it).
  for (const key of ['dev', 'ino', 'size', 'mtimeMs']) {
    const wanted = Number(expected?.[key]);
    if (Number.isFinite(wanted) && Number(actual[key]) !== wanted) return false;
  }
  return true;
}

function validateTextFromFd(fd, size, readSync) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, size));
  let position = 0;
  try {
    while (position < size) {
      const length = Math.min(buffer.length, size - position);
      const read = readSync(fd, buffer, 0, length, position);
      if (!Number.isSafeInteger(read) || read <= 0 || read > length) {
        throw new SourceFormatError('SOURCE_READ_FAILED');
      }
      const decoded = decoder.decode(buffer.subarray(0, read), { stream: position + read < size });
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(decoded)) {
        return false;
      }
      position += read;
    }
    decoder.decode();
    return true;
  } catch (error) {
    if (error instanceof SourceFormatError) throw error;
    return false;
  } finally {
    buffer.fill(0);
  }
}

function detectedMagic(header) {
  if (header.length >= CFB.length && header.subarray(0, CFB.length).equals(CFB)) return 'cfb';
  if (header.length >= 4 && header.readUInt32LE(0) === 0x04034b50) return 'zip';
  if (header.length >= 5 && header.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  if (header.length >= PNG.length && header.subarray(0, PNG.length).equals(PNG)) return 'png';
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'jpeg';
  if (header.length >= 2 && header[0] === 0x42 && header[1] === 0x4d) return 'bmp';
  return 'text-or-unknown';
}

function verdict(declaredType, detectedType, status, code, structure = null) {
  return Object.freeze({
    declared_type: declaredType,
    detected_type: detectedType,
    verdict: status,
    code,
    structure
  });
}

function inspectSourceFormatFromFd(fd, stat, extension, options = {}) {
  const conversion = options.processingMode === 'markdown-only' && options.productChannel === 'standalone';
  const widePrivacy = options.processingMode === 'markdown-and-anonymize' &&
    (options.productChannel === 'standalone' ||
      (options.productChannel === 'plugin' && ['.xlsx', '.pptx'].includes(String(extension || '').toLowerCase())));
  const readSync = options.readSync || fs.readSync;
  const fstatSync = options.fstatSync || fs.fstatSync;
  const ext = String(extension || '').toLowerCase();
  const declaredType = EXTENSION_TYPES[ext];
  if (!declaredType) return verdict('unknown', 'unknown', 'rejected', 'SOURCE_FORMAT_UNSUPPORTED');
  const size = Number(stat?.size);
  if (!Number.isSafeInteger(fd) || !Number.isSafeInteger(size) || size < 1) {
    throw new SourceFormatError('SOURCE_DESCRIPTOR_INVALID');
  }
  let opened;
  try { opened = fstatSync(fd); } catch { throw new SourceFormatError('SOURCE_DESCRIPTOR_INVALID'); }
  if (!sameIdentity(opened, stat)) throw new SourceFormatError('SOURCE_IDENTITY_CHANGED');
  const safeRead = (descriptor, buffer, offset, length, position) => {
    let count;
    try { count = readSync(descriptor, buffer, offset, length, position); }
    catch { throw new SourceFormatError('SOURCE_READ_FAILED'); }
    if (!Number.isSafeInteger(count) || count <= 0 || count > length) {
      throw new SourceFormatError('SOURCE_READ_FAILED');
    }
    return count;
  };
  const finish = (result) => {
    let after;
    try { after = fstatSync(fd); } catch { throw new SourceFormatError('SOURCE_IDENTITY_CHANGED'); }
    if (!sameIdentity(after, stat)) throw new SourceFormatError('SOURCE_IDENTITY_CHANGED');
    return result;
  };
  const header = exactRead(fd, Math.min(16, size), 0, safeRead);
  const magic = detectedMagic(header);

  if (magic === 'cfb') {
    return finish(verdict(declaredType, 'cfb', 'rejected', 'SOURCE_COMPOUND_BINARY_UNSUPPORTED'));
  }

  if (['docx', 'xlsx', 'pptx'].includes(declaredType)) {
    if (magic !== 'zip') return finish(verdict(declaredType, magic, 'rejected', 'SOURCE_TYPE_MISMATCH'));
    let inspected;
    try {
      inspected = inspectZipDirectoryFromFd(fd, size, {
        maxEntries: options.maxEntries || 20000,
        maxUncompressed: options.maxUncompressed || 128 * 1024 * 1024,
        requireExactEnd: true,
        includeStructure: true,
        verifyPayloads: true,
        includeControls: true,
        maxEntryUncompressed: options.maxEntryUncompressed || 64 * 1024 * 1024,
        maxCompressionRatio: options.maxCompressionRatio || 1000,
        maxControlPartBytes: options.maxControlPartBytes || 2 * 1024 * 1024,
        maxControlBytes: options.maxControlBytes || 8 * 1024 * 1024
      }, safeRead);
    } catch (error) {
      if (error instanceof SourceFormatError) throw error;
      if (error instanceof ZipError && ['ZIP_ENCRYPTED_ENTRY', 'OOXML_ENCRYPTED_CONTAINER'].includes(error.code)) {
        return finish(verdict(declaredType, 'zip', 'rejected', 'SOURCE_ENCRYPTED_UNSUPPORTED'));
      }
      if (error instanceof ZipError && error.code === 'ZIP_POLYGLOT') {
        return finish(verdict(declaredType, 'zip', 'rejected', 'SOURCE_POLYGLOT_UNSUPPORTED'));
      }
      if (error instanceof ZipError && error.code === 'ZIP_LIMIT') {
        return finish(verdict(declaredType, 'zip', 'rejected', 'SOURCE_CONTAINER_LIMIT'));
      }
      return finish(verdict(declaredType, 'zip', 'rejected', 'SOURCE_CONTAINER_CORRUPT'));
    }
    const structure = inspected?.structure || null;
    if (!structure || !structure.content_types || !structure.root_relationships || structure.ooxml_type !== declaredType) {
      return finish(verdict(declaredType, 'zip', 'rejected', 'SOURCE_TYPE_MISMATCH', structure));
    }
    const passivePresentation = options.productChannel === 'standalone' &&
      (conversion || options.processingMode === 'markdown-and-anonymize') && declaredType === 'pptx';
    // The Standalone converter never executes OLE binaries. It can read
    // bounded, ordinary XLSX packages linked from a presentation as text;
    // both kinds of source remain explicitly incomplete. Macros and other
    // executable parts still fail before the source is admitted.
    const passivePresentationPartsOnly = passivePresentation && !(inspected.entry_names || []).some(name => {
      const active = /(?:^|\/)(?:vbaProject|oleObject)[^/]*\.bin$/iu.test(name) ||
        /^(?:activeX|customUI|word\/embeddings|xl\/embeddings|ppt\/embeddings)\//iu.test(name);
      return active && !/^ppt\/embeddings\/(?:oleObject[0-9]+\.bin|[^/]+\.xlsx)$/iu.test(name);
    });
    if (structure.active_content && !passivePresentationPartsOnly) {
      return finish(verdict(declaredType, declaredType, 'rejected', 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED', structure));
    }
    let verifiedStructure;
    try {
      verifiedStructure = validateOpcControls({
        declaredType,
        entries: new Set(inspected.entry_names || []),
        controlParts: inspected.control_parts,
        passivePresentation
      });
    } catch (error) {
      if (!(error instanceof OpcValidationError)) throw error;
      return finish(verdict(declaredType, declaredType, 'rejected', error.code));
    }
    const enabled = PILOT_TYPES.has(declaredType) || conversion || widePrivacy;
    const result = verdict(declaredType, declaredType, enabled ? 'candidate' : 'not_released',
      enabled ? 'SOURCE_FORMAT_CANDIDATE' : 'SOURCE_FORMAT_NOT_RELEASED', verifiedStructure);
    return finish(result);
  }

  if (['txt', 'md', 'csv'].includes(declaredType)) {
    if (magic !== 'text-or-unknown') {
      const encryptedZip = magic === 'zip' && (() => {
        try {
          inspectZipDirectoryFromFd(fd, size, { requireExactEnd: true }, safeRead);
          return false;
        } catch (error) {
          return error instanceof ZipError && error.code === 'ZIP_ENCRYPTED_ENTRY';
        }
      })();
      return finish(verdict(declaredType, magic, 'rejected', encryptedZip ? 'SOURCE_ENCRYPTED_UNSUPPORTED' : 'SOURCE_TYPE_MISMATCH'));
    }
    if (!validateTextFromFd(fd, size, safeRead)) {
      return finish(verdict(declaredType, 'binary-or-invalid-utf8', 'rejected', 'SOURCE_TEXT_INVALID'));
    }
    const result = verdict(declaredType, 'text', 'candidate', 'SOURCE_FORMAT_CANDIDATE');
    return finish(result);
  }

  const matches = magic === declaredType || (declaredType === 'jpeg' && magic === 'jpeg');
  const enabled = conversion || widePrivacy;
  const result = verdict(declaredType, magic, matches ? (enabled ? 'candidate' : 'not_released') : 'rejected',
    matches ? (enabled ? 'SOURCE_FORMAT_CANDIDATE' : 'SOURCE_FORMAT_NOT_RELEASED') : 'SOURCE_TYPE_MISMATCH');
  return finish(result);
}

function extensionForName(name) {
  return path.extname(String(name || '')).toLowerCase();
}

module.exports = Object.freeze({
  SourceFormatError,
  EXTENSION_TYPES,
  inspectSourceFormatFromFd,
  extensionForName
});
