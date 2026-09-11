'use strict';

const contract = require('./contracts/cowork-interactions.v1.json');

const SURFACES = new Set(['normal', 'support']);
const PHASES = new Set(['status', 'configuration', 'selection', 'processing', 'handoff', 'review', 'export', 'support']);
const EFFECTS = new Set(['read', 'local_ui', 'local_state', 'local_write', 'local_configuration', 'local_processing', 'destructive_checkpoint']);
const DISPOSITIONS = new Set(['report', 'report_and_stop', 'continue_if_requested']);
const CONTENT_BOUNDARIES = new Set(['metadata_only', 'verified_anonymized_markdown']);
const HUMAN_GATES = new Set(['explicit_request', 'explicit_confirmation', 'second_explicit_confirmation',
  'os_selection', 'os_selection_when_setting', 'explicit_followup_request', 'explicit_support_request']);
const GATE_ASSURANCES = new Set(['none', 'runtime_argument', 'native_dialog', 'skill_contract',
  'support_process', 'mixed', 'skill_contract_plus_runtime_argument']);

function freezeInteraction(name, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid Cowork interaction: ${name}`);
  if (!SURFACES.has(value.surface) || !PHASES.has(value.phase) || !EFFECTS.has(value.effect) ||
      !DISPOSITIONS.has(value.success_disposition)) {
    throw new Error(`Invalid Cowork interaction semantics: ${name}`);
  }
  if (!CONTENT_BOUNDARIES.has(value.content_boundary) || typeof value.idempotent !== 'boolean') {
    throw new Error(`Invalid Cowork interaction boundary: ${name}`);
  }
  if (!Array.isArray(value.human_gates) || value.human_gates.some((gate) => !HUMAN_GATES.has(gate))) {
    throw new Error(`Invalid Cowork human gate: ${name}`);
  }
  if (!GATE_ASSURANCES.has(value.gate_assurance)) throw new Error(`Invalid Cowork gate assurance: ${name}`);
  let variants;
  if (value.variants !== undefined) {
    if (!value.variants || typeof value.variants !== 'object' || Array.isArray(value.variants) ||
        Object.values(value.variants).some((gates) => !Array.isArray(gates) || gates.some((gate) => !HUMAN_GATES.has(gate)))) {
      throw new Error(`Invalid Cowork interaction variants: ${name}`);
    }
    variants = Object.freeze(Object.fromEntries(Object.entries(value.variants)
      .map(([variant, gates]) => [variant, Object.freeze([...gates])])));
  }
  return Object.freeze({...value, human_gates: Object.freeze([...value.human_gates]), ...(variants ? {variants} : {})});
}

if (contract.schema !== 'datasecure-cowork-interactions/1' || contract.closed_world !== true) {
  throw new Error('Unsupported or open Cowork interaction contract.');
}

const INTERACTIONS = Object.freeze(Object.fromEntries(
  Object.entries(contract.interactions).map(([name, value]) => [name, freezeInteraction(name, value)])
));

function assertInteractionBinding(tools) {
  const declared = tools.map((tool) => tool.name).sort();
  const registered = Object.keys(INTERACTIONS).sort();
  if (JSON.stringify(declared) !== JSON.stringify(registered)) {
    throw new Error('MCP tool table and Cowork interaction contract differ.');
  }
}

function interactionForTool(name) {
  return INTERACTIONS[name] || null;
}

function namesForSurface(surface) {
  if (!SURFACES.has(surface)) throw new Error(`Unknown Cowork surface: ${surface}`);
  return Object.freeze(new Set(Object.entries(INTERACTIONS)
    .filter(([, interaction]) => interaction.surface === surface)
    .map(([name]) => name)));
}

function annotationsForTool(tool) {
  const interaction = interactionForTool(tool.name);
  if (!interaction) throw new Error(`Missing Cowork interaction: ${tool.name}`);
  return Object.freeze({
    readOnlyHint: interaction.effect === 'read',
    destructiveHint: interaction.effect === 'destructive_checkpoint',
    idempotentHint: interaction.idempotent,
    openWorldHint: false
  });
}

module.exports = Object.freeze({
  schema: contract.schema,
  INTERACTIONS,
  assertInteractionBinding,
  interactionForTool,
  namesForSurface,
  annotationsForTool
});
