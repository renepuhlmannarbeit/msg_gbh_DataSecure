'use strict';

const { SafeError } = require('../runtime');
const { launchCompanion } = require('./supervisor');

const PROFILES = new Set(['auto', 'customer', 'applicant', 'personnel_profile', 'contract', 'general']);

async function prepareLocalDocument(profile = 'auto', options = {}) {
  const selectedProfile = String(profile || 'auto').toLowerCase();
  if (!PROFILES.has(selectedProfile)) throw new SafeError('Unbekanntes Datenschutzprofil.');
  if ((options.platform || process.platform) !== 'win32') {
    throw new SafeError('Die lokale Textprüfung ist auf diesem Gerät noch nicht verfügbar; es wurde keine Datei ausgewählt.');
  }
  const companion = (options.launchCompanion || launchCompanion)(options.supervisorOptions);
  try {
    await companion.ready;
    const pickParams = { profile: selectedProfile };
    if (options.removeImages === true) pickParams.remove_images = true;
    const picked = await companion.request('pick_sources', pickParams);
    if (!picked?.ok || !Array.isArray(picked.jobs) || !picked.jobs.length ||
      picked.jobs.some((job) => !job?.job_id)) {
      throw new SafeError('Lokale Dateiauswahl wurde nicht sicher abgeschlossen.');
    }
    const results = [];
    for (let index = 0; index < picked.jobs.length; index++) {
      try {
        const processed = await companion.request('process_source', { job_id: picked.jobs[index].job_id });
        results.push({
          item: index + 1,
          ...processed,
          review_decision: processed?.review_decision,
          human_skip_confirmed_locally: processed?.review_decision === 'skipped',
          raw_content_sent_to_claude: false
        });
      } catch (error) {
        results.push({
          item: index + 1,
          ok: false,
          error: 'processing_stopped',
          message: error instanceof SafeError ? error.message : 'Die lokale Verarbeitung wurde sicher abgebrochen.',
          raw_content_sent_to_claude: false
        });
      }
    }
    const released = results.filter((item) => item.ok !== false && item.job?.state === 'Released').length;
    const summary = {
      selected_count: results.length,
      released_count: released,
      failed_count: results.length - released,
      raw_content_sent_to_claude: false
    };
    if (results.length === 1) {
      return { ...results[0], ...summary, workflow: 'local_companion_txt_docx' };
    }
    return {
      ok: released > 0,
      error: released > 0 ? undefined : 'processing_stopped',
      workflow: 'local_companion_txt_docx_batch',
      ...summary,
      results
    };
  } finally {
    companion.close();
  }
}

module.exports = { prepareLocalDocument };
