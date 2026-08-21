'use strict';

const { SafeError } = require('../runtime');
const { launchCompanion } = require('./supervisor');

const PROFILES = new Set(['auto', 'customer', 'applicant', 'personnel_profile', 'contract', 'general']);

async function prepareLocalDocument(profile = 'auto', options = {}) {
  const selectedProfile = String(profile || 'auto').toLowerCase();
  if (!PROFILES.has(selectedProfile)) throw new SafeError('Unbekanntes Datenschutzprofil.');
  const companion = (options.launchCompanion || launchCompanion)(options.supervisorOptions);
  try {
    await companion.ready;
    const picked = await companion.request('pick_source', { profile: selectedProfile });
    if (!picked?.ok || !picked.job?.job_id) throw new SafeError('Lokale Dateiauswahl wurde nicht sicher abgeschlossen.');
    const processed = await companion.request('process_source', { job_id: picked.job.job_id });
    return {
      ...processed,
      workflow: 'local_companion_txt_docx',
      human_skip_confirmed_locally: processed?.job?.state === 'Released',
      raw_content_sent_to_claude: false
    };
  } finally {
    companion.close();
  }
}

module.exports = { prepareLocalDocument };
