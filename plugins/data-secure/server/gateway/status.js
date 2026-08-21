'use strict';

const fs = require('fs');
const path = require('path');
const { runtimeReady, readStatus } = require('../runtime');
const { VERSION, listInput, listPackageDirs } = require('./common');
const { listReviewItems } = require('./review');
const { retentionStatus } = require('./retention');

function genericStatus(options = {}) {
  const engine = readStatus();
  const retention = retentionStatus(options);
  return {
    ok: true,
    version: VERSION,
    engine_ready: runtimeReady(),
    engine_phase: engine.phase,
    engine_message: engine.message,
    text_engine: engine.text_engine,
    visual_bridge: engine.visual_bridge,
    visual_bridge_reason: engine.visual_bridge_reason,
    input_documents: listInput().length,
    anonymized_packages: listPackageDirs().filter((p) =>
      fs.existsSync(path.join(p.full, 'manifest.json'))
    ).length,
    visual_review_items: listReviewItems().items.length,
    retention_days: retention.retention_days,
    retention_due_entries: retention.due_entries,
    retention_last_cleanup: retention.last_cleanup,
    folders_ready: true,
    supported_inputs: ['PDF', 'Word (.docx)', 'Excel (.xlsx)', 'PowerPoint (.pptx)', 'TXT', 'Markdown', 'CSV'],
    runtime_dependency_install: false,
    workflow:
      'Input -> bundled local parser -> bundled PII engine -> residual gate -> ' +
      'visual raster/OCR/redaction or local review -> Output package',
    raw_content_sent_to_claude: false
  };
}

module.exports = { genericStatus };
