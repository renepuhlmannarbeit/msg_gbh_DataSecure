'use strict';

// Plugin boundary only: neither schemas nor MCP dispatch enter Standalone.
const crypto = require('node:crypto');
const validators = require('./mcp-validators.generated');

function assertSchemaBinding(tools) {
  const schemas = tools.map(({ name, inputSchema }) => ({ name, inputSchema }));
  const digest = crypto.createHash('sha256').update(JSON.stringify(schemas)).digest('hex');
  if (digest !== validators.schemaDigest) throw new Error('MCP_GENERATED_VALIDATORS_STALE');
}

function validToolArguments(name, value) {
  if (!Object.hasOwn(validators, name) || typeof validators[name] !== 'function') return false;
  const validate = validators[name];
  try { return validate(value) === true; }
  finally { validate.errors = null; } // Never retain argument-derived error details.
}

module.exports = { assertSchemaBinding, validToolArguments };
