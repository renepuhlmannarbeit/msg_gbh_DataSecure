'use strict';

const MIB = 1024 * 1024;

// 500 MiB is a batch envelope, not a promise that one parser process can
// safely materialise a single 500-MiB source. The isolated parser currently
// reads one source completely and has a 384-MiB V8 heap. These per-format
// intake limits keep the source, decoded representation and bounded response
// below that boundary. They are checked before the private batch snapshot.
const RESOURCE_LIMITS = Object.freeze({
  MAX_INPUT_BYTES: 500 * MIB,
  MAX_BATCH_FILES: 200,
  MAX_BATCH_TOTAL_BYTES: 500 * MIB,
  MAX_TEXT_CHARS: 8_000_000,
  MAX_VISUAL_ASSETS: 150,
  MAX_ASSET_BYTES: 30 * MIB,
  MAX_TEXT_SOURCE_BYTES: 8_000_000,
  // Markdown escaping can expand one CSV source character up to five output
  // characters. Leave room for table separators, headers and JSON framing.
  MAX_CSV_SOURCE_BYTES: 1_500_000,
  // A DOCX is held compressed and expanded while its content graph is built.
  MAX_DOCX_SOURCE_BYTES: 64 * MIB,
  MAX_PDF_SOURCE_BYTES: 25 * MIB,
  MAX_IMAGE_SOURCE_BYTES: 25 * MIB,
  MAX_OOXML_EXPANDED_BYTES: 128 * MIB
});

function sourceLimitForExtension(extension) {
  switch (String(extension || '').toLowerCase()) {
    case '.txt':
    case '.md':
    case '.markdown':
      return RESOURCE_LIMITS.MAX_TEXT_SOURCE_BYTES;
    case '.csv':
      return RESOURCE_LIMITS.MAX_CSV_SOURCE_BYTES;
    case '.docx':
    case '.xlsx':
    case '.pptx':
      return RESOURCE_LIMITS.MAX_DOCX_SOURCE_BYTES;
    case '.pdf':
      return RESOURCE_LIMITS.MAX_PDF_SOURCE_BYTES;
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.bmp':
      return RESOURCE_LIMITS.MAX_IMAGE_SOURCE_BYTES;
    default:
      return RESOURCE_LIMITS.MAX_INPUT_BYTES;
  }
}

function assertSourceSize(extension, size) {
  const bytes = Number(size);
  if (!Number.isSafeInteger(bytes) || bytes < 1) {
    const error = new Error('INPUT_FILE_LIMIT');
    error.code = 'INPUT_FILE_LIMIT';
    throw error;
  }
  if (bytes > RESOURCE_LIMITS.MAX_INPUT_BYTES) {
    const error = new Error('INPUT_FILE_LIMIT');
    error.code = 'INPUT_FILE_LIMIT';
    throw error;
  }
  if (bytes > sourceLimitForExtension(extension)) {
    const error = new Error('INPUT_FORMAT_LIMIT');
    error.code = 'INPUT_FORMAT_LIMIT';
    throw error;
  }
  return bytes;
}

module.exports = { MIB, RESOURCE_LIMITS, sourceLimitForExtension, assertSourceSize };
