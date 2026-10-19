'use strict';

// Display-only projection: no approval, work start, export or file access.
(() => {
  const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= 200;
  function resultPublication(value) {
    if (!value || !['initial', 'current', 'pending', 'conflict'].includes(value.state) ||
        Object.keys(value).some(key => !['state', 'generation_id', 'count', 'current_revision'].includes(key)) ||
        value.generation_id !== undefined && value.generation_id !== null && !/^[a-f0-9]{32}$/u.test(value.generation_id) ||
        value.state === 'current' && !/^[a-f0-9]{32}$/u.test(value.generation_id || '') ||
        value.count !== undefined && !integer(value.count) || value.current_revision !== undefined &&
        (!Number.isSafeInteger(value.current_revision) || value.current_revision < 0 || value.current_revision > 1000)) return null;
    return value;
  }
  function validateConversionFeedback(value) {
    const counts = ['selected_count', 'result_count', 'not_converted_count', 'ocr_omitted_count', 'error_count', 'content_notice_count', 'pending_count'];
    const fields = ['schema', 'ocr_enabled', 'complete', ...counts].sort();
    if (!value || Object.keys(value).sort().join(',') !== fields.join(',') ||
        value.schema !== 'datasecure-conversion-feedback/1' || typeof value.ocr_enabled !== 'boolean' || typeof value.complete !== 'boolean' ||
        counts.some(key => !integer(value[key])) || value.selected_count < 1 ||
        value.result_count + value.not_converted_count + value.pending_count !== value.selected_count ||
        value.ocr_omitted_count + value.error_count !== value.not_converted_count ||
        value.content_notice_count > value.result_count || value.ocr_enabled && value.ocr_omitted_count ||
        value.complete && value.pending_count) return null;
    return value;
  }
  function conversionSummary(owner) {
    const value = validateConversionFeedback(owner?.conversion_feedback);
    if (owner?.processing_mode !== 'markdown-only' || !value || !value.complete ||
        !integer(owner.selected_count) || !integer(owner.result_count) || !integer(owner.failed_count) ||
        owner.problem_count !== undefined && !integer(owner.problem_count) ||
        !['results_available', 'completed_without_results'].includes(owner.status || owner.state) ||
        owner.resumable === true || owner.processing === true || owner.completion_pending === true ||
        owner.result_location && !['available', 'not_created'].includes(owner.result_location) ||
        value.selected_count !== owner.selected_count || value.result_count !== owner.result_count ||
        value.not_converted_count !== Math.max(owner.failed_count || 0, owner.problem_count || 0)) return null;
    return { ...value, heading: value.error_count ? 'Lauf abgeschlossen mit Fehlern'
      : value.ocr_omitted_count || value.content_notice_count ? 'Lauf abgeschlossen mit Hinweisen' : 'Lauf abgeschlossen',
      counts: `${value.selected_count} Dateien · ${value.result_count} Markdown-Dateien · ${value.ocr_omitted_count} ohne OCR nicht umgewandelt · ${value.error_count} technische Fehler`,
      description: `${value.result_count} Markdown-Datei${value.result_count === 1 ? '' : 'en'} erstellt. ` +
        (value.ocr_omitted_count ? `OCR war ausgeschaltet; ${value.ocr_omitted_count} Bild- oder Scan-Datei${value.ocr_omitted_count === 1 ? ' wurde' : 'en wurden'} nicht umgewandelt. ` : '') +
        (value.error_count ? `${value.error_count} Datei${value.error_count === 1 ? '' : 'en'} mit technischen Fehlern: Gründe ansehen. ` : '') +
        (value.result_count ? 'Ergebnisordner öffnen. Nachkorrektur ist optional; keine Freigabe erforderlich. Inhalte sind nicht anonymisiert.'
          : value.ocr_omitted_count ? 'Keine Ergebnisdateien vorhanden. Wenn du den Bild- oder Scantext benötigst, die Originaldateien für einen neuen Lauf mit OCR auswählen.'
            : 'Keine Ergebnisdateien vorhanden. Die Fehlerursachen und betroffenen Dateien ansehen; Originale bleiben unverändert.') };
  }
  function contentNoticeSummary(owner) {
    if (owner?.processing_mode !== 'markdown-and-anonymize') return null;
    const valid = integer(owner.content_notice_count) && integer(owner.result_count) &&
      owner.content_notice_count <= owner.result_count;
    const count = valid ? owner.content_notice_count : 0;
    const complete = valid && owner.content_notice_breakdown_complete === true;
    return { count, complete, attention: count > 0 || !complete,
      description: (count ? `${complete ? '' : 'Mindestens '}${count} erstellte Datei${count === 1 ? ' enthält' : 'en enthalten'} Inhaltshinweise, zum Beispiel zur Texterkennung oder zu ausgelassenen Inhalten. ` : '') +
        (!complete ? 'Inhaltshinweise sind für diesen gespeicherten Stand nicht vollständig verfügbar; fehlende Angaben bedeuten nicht, dass alles fehlerfrei übernommen wurde. ' : '') +
        (count ? 'Die Dateien wurden erstellt; der Lauf ist deshalb nicht erneut offen.' : '') };
  }
  // Historical receipts cover available result revisions, not every source.
  // Journal-proven OCR omissions and privacy stops remain explicit warnings.
  // Neither classification grants release or copy authority for those sources.
  function historyReviewProjection(entry, data) {
    const keys = ['reviewable_count', 'approved_count', 'unavailable_count', 'unclassified_source_count',
      'current_exported_count', 'pending_export_count', 'pending_incomplete_count', 'pending_confirmation_count'];
    const omitted = entry?.expected_ocr_omission_count === undefined ? 0 : entry.expected_ocr_omission_count;
    const privacyStops = entry?.privacy_stop_count === undefined ? 0 : entry.privacy_stop_count;
    const notProcessed = data?.not_processed_count === undefined ? 0 : data.not_processed_count;
    if (!entry || !/^[a-f0-9]{64}$/u.test(entry.batch_id || '') || entry.processing_mode !== 'markdown-and-anonymize' ||
        entry.status !== 'results_available' || entry.results_available !== true || entry.result_location !== 'available' ||
        entry.resumable === true || entry.processing === true || entry.completion_pending === true ||
        !integer(entry.selected_count) || entry.selected_count < 1 || !integer(entry.result_count) || entry.result_count < 1 ||
        !integer(entry.failed_count) || entry.result_count + entry.failed_count !== entry.selected_count ||
        entry.completed_count !== undefined && entry.completed_count !== entry.selected_count ||
        entry.problem_count !== undefined && (!integer(entry.problem_count) || entry.problem_count > entry.failed_count) ||
        !integer(omitted) || !integer(privacyStops) || omitted + privacyStops !== entry.failed_count ||
        entry.failed_count > 0 && entry.failure_reason_breakdown_complete !== true ||
        !data || data.ok !== true || data.local_ui_only !== true || data.external_disclosure !== false || data.available !== true ||
        data.processing_mode !== entry.processing_mode || keys.some(key => !integer(data[key])) ||
        !integer(notProcessed) || notProcessed !== entry.failed_count ||
        data.reviewable_count !== entry.result_count || data.reviewable_count + notProcessed !== entry.selected_count ||
        data.approved_count > data.reviewable_count || data.unavailable_count !== 0 || data.unclassified_source_count !== 0 ||
        data.current_exported_count > data.reviewable_count || !Number.isSafeInteger(data.recorded_export_count) || data.recorded_export_count < 0 ||
        data.current_exported_count > 0 && data.recorded_export_count === 0 ||
        data.pending_export_count !== data.pending_incomplete_count + data.pending_confirmation_count ||
        entry.review_policy !== undefined && entry.review_policy !== 'automatic-conservative' ||
        (entry.review_policy ?? null) !== (data.review_policy ?? null) ||
        data.review_policy !== undefined && (data.review_policy !== 'automatic-conservative' ||
          !integer(data.automatically_approved_count) || data.automatically_approved_count > data.approved_count)) return null;
    const projection = projectRun({ ...entry, source: 'documents', fresh: true, processing_complete: true,
      document_count: data.reviewable_count, approved_count: data.approved_count, problem_count: 0,
      ...(data.result_publication ? { result_publication: data.result_publication } : {}),
      expected_omission_count: omitted,
      automatically_approved_count: data.automatically_approved_count ?? 0,
      export_pending: data.pending_export_count > 0,
      export_complete: data.recorded_export_count > 0 && data.current_exported_count === data.reviewable_count });
    if (notProcessed) {
      projection.stages[0].status = 'warning';
      projection.counts += ' · ' + entry.result_count + ' von ' + entry.selected_count + ' Quellen als Ergebnis verfügbar';
      if (omitted) projection.counts += ' · ' + omitted + ' ohne OCR nicht umgewandelt';
      if (privacyStops) {
        projection.stages[1].status = 'warning';
        projection.counts += ' · ' + privacyStops + ' aus Datenschutzgründen angehalten';
        projection.next += ' ' + privacyStops + (privacyStops === 1 ? ' Quelle wurde' : ' Quellen wurden') +
          ' aus Datenschutzgründen angehalten. Für ' + (privacyStops === 1 ? 'diese Quelle gibt' : 'diese Quellen gibt') + ' es keinen freigabefähigen Prüfstand.';
      }
      projection.next += ' Die ' + (notProcessed === 1 ? 'nicht verarbeitete Quelle ist' : notProcessed + ' nicht verarbeiteten Quellen sind') +
        ' nicht in den Ergebnisdateien enthalten.';
    }
    projection.expected_omission_count = omitted;
    projection.privacy_stop_count = privacyStops;
    projection.not_processed_count = notProcessed;
    projection.counts = 'Abgeglichener Stand: ' + projection.counts;
    return projection;
  }
  function projectRun(value) {
    if (!value || !['processor', 'review', 'documents'].includes(value.source) || !/^[a-f0-9]{64}$/u.test(value.batch_id || '') ||
        !['markdown-only', 'markdown-and-anonymize'].includes(value.processing_mode)) return null;
    const raw = value.processing_mode === 'markdown-only';
    const fast = !raw && value.review_policy === 'automatic-conservative';
    const contactReviewActive = raw && (value.source === 'review' || value.state === 'review_required' ||
      value.state === 'processing' && value.review_count > 0);
    const labels = raw ? ['Text übernehmen', contactReviewActive ? 'Gewählte OCR-Kontaktprüfung' : 'Markdown nachkorrigieren (optional)', 'Markdown-Dateien']
      : ['Text übernehmen', fast ? 'Fundstellen automatisch behandeln' : 'Fundstellen prüfen',
        'Ergebnisdateien bereitstellen', 'Nachbearbeitung (optional)'];
    const output = { batchId: value.batch_id, raw, phase: 'unknown', heading: 'Laufstatus abgleichen',
      next: 'Gespeicherten Stand neu laden. Keine Freigabe oder Export daraus ableiten.',
      busy: false, stages: labels.map(label => ({ label, status: 'pending' })) };
    const set = (phase, index, heading, next, busy = false) => {
      Object.assign(output, { phase, heading, next, busy });
      if (index >= 0) output.stages[index].status = 'current';
    };
    if (value.source === 'documents') {
      // A durable ACK is a historical fact even while the optional current
      // document list is stale. It grants no fresh approval/export authority.
      if ((value.busy === true || value.fresh !== true) && integer(value.confirmed_copy_count) &&
          value.confirmed_copy_count > 0 && value.confirmed_copy_count <= 200 && value.export_pending !== true) {
        output.phase = 'copy_confirmed';
        output.heading = raw ? 'Markdown-Kopie abgeschlossen' : 'Export abgeschlossen';
        output.stages[raw ? 2 : 3].status = 'done';
        output.counts = `${value.confirmed_copy_count} ausgewählte Dateien bestätigt kopiert`;
        output.next = 'Diese Kopie ist abgeschlossen. Den Verlauf kannst du öffnen; der heutige Dokumentstatus wird getrennt geprüft. Bis dahin bleiben Änderungen und neue Kopien gesperrt.';
        return output;
      }
      if (value.busy === true) { output.busy = true; output.heading = 'Lokaler Prüfvorgang läuft'; output.next = 'Bitte warten. Der gespeicherte Stand wird abgeglichen; noch keine neue Freigabe oder Kopie ableiten.'; return output; }
      if (value.fresh !== true || !integer(value.document_count) || !integer(value.approved_count) ||
          value.approved_count > value.document_count || !integer(value.problem_count)) return output;
      if (value.document_count === 0) { output.heading = 'Keine verfügbaren Dokumentprüfstände'; output.next = 'Betroffene Dateien und ihren gespeicherten Status prüfen. Keine Freigabe oder Export ableitbar.'; return output; }
      const wholeRun = value.processing_complete === true;
      output.stages[0].status = wholeRun ? value.problem_count ? 'warning' : 'done' : 'pending';
      if (!raw) output.stages[1].status = wholeRun ? value.problem_count ? 'warning' : 'done' : 'pending';
      const review = raw ? 1 : 3, copy = 2;
      if (value.dirty === true) set('editing', review, 'Korrektur noch nicht gespeichert', 'Korrektur speichern oder ausdrücklich verwerfen. Noch keine neue Kopie erstellen.');
      else {
        const publication = value.result_publication === undefined ? null : resultPublication(value.result_publication);
        if (value.result_publication !== undefined && (!publication ||
            publication.count !== undefined && publication.count !== value.document_count)) return output;
        if (publication && ['pending', 'conflict'].includes(publication.state)) set('result_pending', copy,
          'Aktueller Ergebnisstand noch nicht bestätigt', 'Die Nachbearbeitung kann bereits gespeichert sein. Denselben Ergebnisstand erneut abgleichen; keine Änderung blind wiederholen.');
        else if (wholeRun && (publication || value.has_modified_results !== true)) {
          output.stages[copy].status = 'done';
          Object.assign(output, { phase: 'results_ready', heading: raw ? 'Markdown-Ergebnisse bereit' : 'Anonymisierte Ergebnisse bereit',
            next: 'Ergebnisordner öffnen. Dateien dort auswählen oder weiterverwenden; keine zusätzliche Freigabe oder Exportbestätigung nötig. Nachbearbeitung ist freiwillig.' });
        } else if (wholeRun) set('result_pending', copy, 'Aktueller Ergebnisstand nicht bestätigt', 'Der Nachbearbeitungsstand ist noch nicht als Ergebnisdateien bestätigt. Bereitstellung erneut prüfen.');
        else set('documents', -1, 'Verfügbare Ergebnisse ansehen (optional)', 'Der Laufabschluss ist noch nicht bestätigt. Bereits verfügbare Dateien sind nicht der gesamte Stapel.');
      }
      output.stages[review].status = value.dirty === true ? 'current' : 'optional';
      output.counts = `${value.document_count} Ergebnisdateien · Nachbearbeitung freiwillig`;
      if (fast) output.next += ' Bekannte unklare Fundstellen wurden automatisch maskiert, nicht manuell geprüft.';
      if (!wholeRun) output.next += ' Der Laufabschluss ist noch nicht bestätigt; verfügbare Dokumente sind nicht der gesamte Stapel.';
      if (value.problem_count) output.next += ` ${value.problem_count} Dateien sind nicht vollständig verfügbar; betroffene Dateien ansehen.`;
      if (integer(value.expected_omission_count) && value.expected_omission_count > 0)
        output.next += ` OCR war ausgeschaltet; ${value.expected_omission_count} Bild- oder Scan-Datei${value.expected_omission_count === 1 ? ' wurde' : 'en wurden'} deshalb nicht umgewandelt. Das ist kein technischer Fehler.`;
      if (!raw && wholeRun) {
        const notices = contentNoticeSummary(value);
        if (notices.attention) output.stages[0].status = 'warning';
        if (notices.description) output.next += ` ${notices.description}`;
      }
      return output;
    }
    const total = integer(value.selected_count) ? value.selected_count : 0;
    const done = integer(value.completed_count) ? value.completed_count : 0;
    const failed = integer(value.failed_count) ? value.failed_count : 0;
    if (['selected_count', 'completed_count', 'failed_count'].some(key =>
        value[key] !== undefined && !integer(value[key])) || total && done > total || failed > done) return output;
    // completed_count already includes terminal stops, not just successes.
    const complete = total > 0 && done === total;
    output.counts = total ? `${done} von ${total} Dateien abgeschlossen${failed ? ` · ${failed} nicht umgewandelt` : ''}` : 'Dateifortschritt wird abgeglichen';
    const summary = value.source === 'processor' && conversionSummary(value);
    if (summary && (value.result_publication === undefined || resultPublication(value.result_publication) &&
        ['initial', 'current'].includes(value.result_publication.state) &&
        (value.result_publication.count === undefined || value.result_publication.count === value.result_count))) {
      output.stages[0].status = summary.ocr_omitted_count || summary.error_count || summary.content_notice_count ? 'warning' : 'done';
      output.stages[1].status = 'optional';
      if (summary.result_count) output.stages[2].status = 'current';
      Object.assign(output, { phase: summary.result_count ? 'converted' : 'converted_without_results',
        heading: summary.heading, next: summary.description, counts: summary.counts });
      return output;
    }
    if (value.source === 'review') {
      if (complete) output.stages[0].status = failed ? 'warning' : 'done';
      const phase = value.review_phase || 'ready';
      if (phase === 'ready') set('review', 1, raw ? 'OCR-Kontaktprüfung dieses Laufs' : 'Fundstellenprüfung dieses Laufs', raw
        ? 'Du hast die zusätzliche Prüfung beim Start gewählt. Erkannte E-Mail-/Telefonwerte mit dem Originalbild vergleichen, Entscheidungen vormerken und die vollständige Gruppe ausdrücklich speichern.'
        : 'Entscheidungen vormerken und die vollständige Gruppe ausdrücklich speichern.');
      else if (phase === 'complete') set('review_complete', -1, raw ? 'OCR-Kontaktprüfung abgeschlossen' : 'Fundstellenprüfung abgeschlossen', raw
        ? 'Zum Abschluss dieses Markdown-Laufs zurückkehren. Nachbearbeitung ist optional; keine weitere Pflichtfreigabe. Inhalte sind nicht anonymisiert.'
        : 'Zum Abschluss desselben Laufs zurückkehren. Deine Maskierungen sind angewendet; die Ergebnisdateien werden bereitgestellt. Keine zweite Dateiauswahl, Freigabe oder Exportbestätigung nötig.');
      else if (phase === 'deferred') set('review_deferred', 1, raw ? 'OCR-Kontaktprüfung vertagt' : 'Fundstellenprüfung vertagt', raw
        ? 'Zum Markdown-Lauf zurückkehren und die gewählte Kontaktprüfung später im Verlauf ausdrücklich fortsetzen. Kontaktwerte bleiben ungeprüft; Inhalte sind nicht anonymisiert.'
        : 'Zum Lauf zurückkehren und die Prüfung später im Verlauf ausdrücklich fortsetzen. Offene Fundstellen bleiben ungeprüft. Weder Dokumentfreigabe noch Export sind damit bestätigt.');
      else if (phase === 'continue') set('review_continue', 1, raw ? 'Weitere OCR-Kontaktwerte sind bereit' : 'Weitere Fundstellen sind bereit', raw
        ? 'Die gewählte Kontaktprüfung im selben Bereich fortsetzen. Die übrigen OCR-Texte werden dadurch nicht automatisch geprüft.'
        : 'Die nächste Prüfung im selben Bereich fortsetzen; noch keine Dokumentfreigabe.');
      else if (phase === 'failed' || phase === 'unbound') set('review_unavailable', -1, 'Prüfschritt nicht verfügbar', 'Den Hinweis und die betroffenen Dateien im Prüfer ansehen. Nicht ungeprüft freigeben.');
      else if (phase === 'export_pending') set('delivery_pending', -1, 'Technische Bereitstellung noch offen', 'Den Bereitstellungshinweis beim zugehörigen Lauf prüfen. Keine weitere Entscheidung ableitbar.');
      else if (phase === 'uncertain') set('review_uncertain', -1, 'Prüfbestätigung noch unklar', 'Gespeicherten Stand abgleichen. Die Entscheidung wird nicht automatisch nochmals gesendet.');
      else set('review_waiting', 1, raw ? 'Weitere OCR-Kontaktwerte werden vorbereitet' : 'Weitere Fundstellen werden vorbereitet', raw
        ? 'DataSecure arbeitet weiter. Weitere Kontaktgruppen erscheinen hier; bitte warten.'
        : 'DataSecure arbeitet weiter. Folgegruppen erscheinen hier; bitte warten.', true);
      return output;
    }
    if (value.state === 'preparing' || value.state === 'processing')
      set('processing', 0, 'Textübernahme läuft', value.pause_requested === true
        ? 'Pause angefordert. Die aktuelle Datei wird abgeschlossen; danach beginnt keine weitere.'
        : 'Du musst momentan nichts entscheiden. Die Verarbeitung bleibt lokal.', true);
    else if (value.state === 'review_required') {
      if (complete) output.stages[0].status = failed ? 'warning' : 'done';
      set('review', 1, raw ? 'OCR-Kontaktprüfung offen' : 'Fundstellen benötigen Entscheidungen', raw
        ? 'Die beim Start gewählte Prüfung hält den Markdown-Lauf für erkannte E-Mail-/Telefonwerte an. Werte prüfen oder bewusst später fortsetzen.'
        : 'Fundstellen prüfen oder bewusst später fortsetzen.');
    } else if (value.state === 'results_available') {
      const publication = value.result_publication === undefined ? null : resultPublication(value.result_publication);
      if (value.result_publication !== undefined && !publication || publication && (['pending', 'conflict'].includes(publication.state) ||
          publication.count !== undefined && publication.count !== value.result_count) ||
          value.results_available === false || !complete || value.result_count === 0) {
        set('result_pending', 2, 'Ergebnisbereitstellung noch nicht bestätigt', 'Den gespeicherten Ergebnisstand dieses Laufs abgleichen. Keine neue Verarbeitung blind starten.');
        return output;
      }
      output.stages[0].status = failed ? 'warning' : 'done';
      if (raw) { const summary = conversionSummary(value); output.stages[1].status = 'optional'; set('converted', 2,
        summary?.heading || 'Textübernahme abgeschlossen', summary?.description || 'Markdown-Dateien öffnen. Nachkorrektur ist optional; Inhalte sind nicht anonymisiert.'); }
      else {
        output.stages[1].status = 'done';
        const notices = contentNoticeSummary(value);
        if (notices.attention) output.stages[0].status = 'warning';
        set('results_ready', -1, failed || value.warning_count > 0 || notices.attention ? 'Anonymisierungslauf abgeschlossen mit Hinweisen' : 'Anonymisierungslauf abgeschlossen',
          value.review_policy === 'automatic-conservative'
            ? 'Bekannte unklare Fundstellen wurden automatisch maskiert, nicht manuell geprüft. Ergebnisordner öffnen; keine zusätzliche Freigabe oder Exportbestätigung nötig.'
            : 'Die Verarbeitung ist fertig. Ergebnisordner öffnen und Dateien dort auswählen oder weiterverwenden. Nachbearbeitung ist freiwillig; keine zusätzliche Freigabe oder Exportbestätigung nötig.');
        output.stages[2].status = 'done'; output.stages[3].status = 'optional';
        if (notices.description) output.next += ` ${notices.description}`;
      }
    } else if (value.state === 'paused')
      set('paused', -1, 'Dieser Lauf ist pausiert', 'Verarbeitung fortsetzen, wenn du bereit bist. Es wird keine neue Datei automatisch gestartet.');
    else if (value.state === 'export_pending')
      set('delivery_pending', -1, 'Technische Bereitstellung noch offen', 'Ergebnisordner und Zugriffsrechte prüfen. Das ist noch kein abgeschlossener Export.');
    else if (value.state === 'export_abandoned')
      set('delivery_abandoned', -1, 'Bereitstellung dieses Laufs aufgegeben', 'Fehlende Dateien werden nicht mehr automatisch kopiert. Teilkopien bleiben unverändert; keine vollständige Freigabe zur Weitergabe.');
    else if (value.state === 'completed_without_results') {
      output.stages[0].status = 'warning';
      set('completed_without_results', -1, 'Verarbeitung beendet ohne Ergebnisdateien',
        'Für diesen Lauf wurden keine verwendbaren Markdown-Dateien erstellt. Betroffene Quelldateien und Gründe ansehen; es gibt nichts freizugeben oder zu exportieren. Ein neuer Lauf erfordert eine erneute Dateiauswahl.');
    } else if (['stopped', 'failed', 'blocked'].includes(value.state))
      set('interrupted', -1, 'Verarbeitung noch nicht abgeschlossen', 'Betroffene Dateien und Ursache ansehen. Nur die angebotene zulässige Fortsetzung verwenden.');
    return output;
  }
  function failureAdvice(code) {
    if (['IMAGE_OCR_REQUIRED', 'PDF_TEXT_UNAVAILABLE_BY_POLICY'].includes(code)) return 'Die betroffene Originaldatei neu auswählen und „Text aus Scans, Bildern und Grafiken per OCR lesen“ einschalten. Die Optionen eines bestehenden Laufs werden nicht nachträglich geändert.';
    if (code === 'PDF_OCR_SCOPE_REQUIRED') return 'Die betroffene PDF für einen neuen Lauf mit der gemeinsamen OCR-Option auswählen. Es werden keine unklaren Bereiche ohne deine Auswahl gelesen.';
    if (code === 'OFFICE_IMAGE_OCR_UNAVAILABLE') return 'Das betreffende Bild separat als PNG, JPEG oder BMP auswählen oder eine PDF-Kopie des Dokuments mit OCR umwandeln. Das Original bleibt unverändert.';
    if (code === 'MARKDOWN_IMAGE_OCR_UNAVAILABLE') return 'Die benötigten Bilddateien zusätzlich ausdrücklich auswählen. Alternativ Markdown ohne Bild-OCR umwandeln; vorhandene Bildbeschriftungen bleiben erhalten.';
    if (code === 'CONVERSION_OCR_TEXT_EMPTY') return 'Die Originaldatei auf lesbaren Text und ausreichende Scanqualität prüfen. Es wurde kein leerer Scheinerfolg erstellt.';
    if (code === 'MARKDOWN_CONTENT_TRANSFORM_FAILED') return 'Bild-/SVG-Syntax in einer separaten Kopie prüfen und diese neu auswählen. Die App löscht keine unklar begrenzten Inhalte.';
    if (code === 'OCR_CONTACT_REVIEW_INVALID') return 'Die unveränderten Originaldateien für einen neuen Lauf auswählen. Die alte OCR-Entscheidung wird nicht automatisch übernommen.';
    if (['SOURCE_ENCRYPTED_UNSUPPORTED', 'PASSWORD_PROTECTED_DOCUMENT_UNSUPPORTED'].includes(code)) return 'Eine ungeschützte Kopie separat auswählen. Das Original bleibt unverändert.';
    if (['CONVERSION_EXECUTABLE_MISSING', 'CONVERSION_DEPENDENCY_MISSING', 'CONVERSION_ARCHITECTURE_INVALID'].includes(code)) return 'Das vollständige Paket für dieses Betriebssystem und diese Architektur neu entpacken. Fehlende Komponenten nicht einzeln ersetzen.';
    if (['CONVERSION_EXECUTABLE_DENIED', 'SOURCE_ACCESS_DENIED'].includes(code)) return 'Zugriffsrechte beziehungsweise OS-Blockade mit der IT prüfen. Schutzfunktionen nicht deaktivieren.';
    if (['CONVERSION_LIMIT_SETUP_FAILED', 'CONVERSION_ISOLATION_FAILED', 'CONVERSION_ISOLATION_UNAVAILABLE', 'CONVERSION_TERMINATION_UNCONFIRMED'].includes(code)) return 'Nicht erneut starten. Die inhaltsfreie Diagnose und das bestätigte Ende des Hintergrundprozesses prüfen.';
    if (['SOURCE_FORMAT_UNSUPPORTED', 'SOURCE_TYPE_MISMATCH', 'SOURCE_COMPOUND_BINARY_UNSUPPORTED', 'SOURCE_FORMAT_NOT_RELEASED'].includes(code)) return 'Die Datei in der Ursprungsanwendung in einem unterstützten Format speichern und separat neu auswählen.';
    if (['SOURCE_READ_FAILED', 'SOURCE_IDENTITY_CHANGED', 'SOURCE_CONTAINER_CORRUPT', 'SOURCE_TEXT_INVALID', 'PARSE_FAILED'].includes(code)) return 'Die Quelldatei und den lokalen Lesezugriff prüfen; anschließend eine korrigierte Kopie neu auswählen.';
    if (['LOCAL_REVIEW_TOO_LARGE', 'SOURCE_FORMAT_SIZE_LIMIT', 'CONVERSION_RESOURCE_LIMIT', 'CONVERSION_TIMEOUT'].includes(code)) return 'Das Dokument in kleinere Teile aufteilen und diese neu auswählen. Keine Prüfschritte überspringen.';
    if (['RESIDUAL_PII', 'AMBIGUITY_REVIEW_REQUIRED'].includes(code)) return 'Für diese Datei wurde kein freigabefähiger Prüfstand erstellt. Sie einzeln neu anonymisieren; bei erneutem Halt den Fehlercode über „Diagnose öffnen“ prüfen. Nicht weitergeben.';
    if (code === 'LOCAL_MAPPING_PENDING') return 'Den zugehörigen Lauf fortsetzen, um genau diese Bereitstellung erneut abzugleichen.';
    return 'Den gespeicherten Laufstatus und die inhaltsfreie Diagnose prüfen. Nicht blind neu starten; die genaue Ursache ist noch nicht bestätigt.';
  }
  const api = Object.freeze({ projectRun, historyReviewProjection, failureAdvice, validateConversionFeedback, conversionSummary, contentNoticeSummary, resultPublication });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.defineProperty(window, '__DATASECURE_PRESENTATION__', { value: api });
})();
