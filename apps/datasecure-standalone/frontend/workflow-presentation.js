'use strict';

// Display-only projection: no approval, work start, export or file access.
(() => {
  const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= 200;
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
  function projectRun(value) {
    if (!value || !['processor', 'review', 'documents'].includes(value.source) || !/^[a-f0-9]{64}$/u.test(value.batch_id || '') ||
        !['markdown-only', 'markdown-and-anonymize'].includes(value.processing_mode)) return null;
    const raw = value.processing_mode === 'markdown-only';
    const contactReviewActive = raw && (value.source === 'review' || value.state === 'review_required' ||
      value.state === 'processing' && value.review_count > 0);
    const labels = raw ? ['Text übernehmen', contactReviewActive ? 'Gewählte OCR-Kontaktprüfung' : 'Markdown nachkorrigieren (optional)', 'Markdown-Dateien']
      : ['Text übernehmen', 'Fundstellen prüfen', 'Dokumente freigeben', 'Für KI exportieren'];
    const output = { batchId: value.batch_id, raw, phase: 'unknown', heading: 'Laufstatus abgleichen',
      next: 'Gespeicherten Stand neu laden. Keine Freigabe oder Export daraus ableiten.',
      busy: false, stages: labels.map(label => ({ label, status: 'pending' })) };
    const set = (phase, index, heading, next, busy = false) => {
      Object.assign(output, { phase, heading, next, busy });
      if (index >= 0) output.stages[index].status = 'current';
    };
    if (value.source === 'documents') {
      if (value.busy === true) { output.busy = true; output.heading = 'Lokaler Prüfvorgang läuft'; output.next = 'Bitte warten. Der gespeicherte Stand wird abgeglichen; noch keine neue Freigabe oder Kopie ableiten.'; return output; }
      if (value.fresh !== true || !integer(value.document_count) || !integer(value.approved_count) ||
          value.approved_count > value.document_count || !integer(value.problem_count)) return output;
      if (value.document_count === 0) { output.heading = 'Keine verfügbaren Dokumentprüfstände'; output.next = 'Betroffene Dateien und ihren gespeicherten Status prüfen. Keine Freigabe oder Export ableitbar.'; return output; }
      const wholeRun = value.processing_complete === true;
      output.stages[0].status = wholeRun ? value.problem_count ? 'warning' : 'done' : 'pending';
      if (!raw) output.stages[1].status = wholeRun ? value.problem_count ? 'warning' : 'done' : 'pending';
      const review = raw ? 1 : 2, copy = raw ? 2 : 3;
      if (value.dirty === true) set('editing', review, 'Korrektur noch nicht gespeichert', 'Korrektur speichern oder ausdrücklich verwerfen. Noch keine neue Kopie erstellen.');
      else if (value.export_pending === true) set('export_pending', copy, 'Exportbestätigung noch offen', 'Denselben Export abgleichen. Nicht erneut starten.');
      else if (value.export_complete === true && value.document_count > 0 &&
          value.approved_count === value.document_count) {
        if (wholeRun && value.problem_count === 0) {
          output.stages[review].status = 'done'; output.stages[copy].status = 'done';
          Object.assign(output, { phase: 'exported', heading: raw ? 'Markdown-Kopie gespeichert' : 'KI-Export abgeschlossen',
            next: 'Die bestätigte Kopie kannst du über den gespeicherten Exportbeleg öffnen.' });
        } else set('selection_exported', copy, raw ? 'Markdown-Auswahl gespeichert' : 'Ausgewählte Dokumente exportiert',
          'Die ausgewählte Kopie ist bestätigt. Weitere Dateien und den Abschluss dieses Laufs gesondert prüfen.');
      } else if (!raw && value.document_count > 0 && value.approved_count === value.document_count) {
        output.stages[review].status = wholeRun ? 'done' : 'pending';
        set('approved', copy, raw ? 'Textprüfung gespeichert' : 'Verfügbare Dokumente freigegeben',
          raw ? 'Korrigierte Markdown-Kopie ausdrücklich speichern. Sie enthält Originalinhalte.' : 'Freigegebene Dokumente auswählen und den KI-Export ausdrücklich bestätigen.');
      } else set('documents', review, raw ? 'Markdown prüfen und korrigieren' : 'Dokumentprüfung offen',
        raw ? 'Nachkorrektur ist optional. Bereits konvertierte Dateien sind nicht anonymisiert.' : 'Vollständige Dokumente vergleichen und gewünschte aktuelle Stände freigeben.');
      if (raw) output.stages[review].status = value.dirty === true ? 'current' : 'optional';
      output.counts = raw ? `${value.document_count} Markdown-Dateien verfügbar · Nachkorrektur freiwillig`
        : `${value.approved_count} von ${value.document_count} verfügbaren Dokumenten freigegeben`;
      if (!wholeRun) output.next += ' Der Laufabschluss ist noch nicht bestätigt; verfügbare Dokumente sind nicht der gesamte Stapel.';
      if (value.problem_count) output.next += ` ${value.problem_count} Dateien sind nicht vollständig verfügbar; betroffene Dateien ansehen.`;
      if (integer(value.expected_omission_count) && value.expected_omission_count > 0)
        output.next += ` OCR war ausgeschaltet; ${value.expected_omission_count} Bild- oder Scan-Datei${value.expected_omission_count === 1 ? ' wurde' : 'en wurden'} deshalb nicht umgewandelt. Das ist kein technischer Fehler.`;
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
    if (summary) {
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
        : 'Die Dokumentprüfung desselben Laufs wird geöffnet. Freigabe und Export folgen gesondert.');
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
      output.stages[0].status = failed ? 'warning' : 'done';
      if (raw) { const summary = conversionSummary(value); output.stages[1].status = 'optional'; set('converted', 2,
        summary?.heading || 'Textübernahme abgeschlossen', summary?.description || 'Markdown-Dateien öffnen. Nachkorrektur ist optional; Inhalte sind nicht anonymisiert.'); }
      else { output.stages[1].status = 'done'; set('documents', 2, 'Dokumentprüfung offen', 'Die technische Verarbeitung ist abgeschlossen. Dokumente nachprüfen; noch keine menschliche Freigabe und kein KI-Export.'); }
    } else if (value.state === 'paused')
      set('paused', -1, 'Dieser Lauf ist pausiert', 'Verarbeitung fortsetzen, wenn du bereit bist. Es wird keine neue Datei automatisch gestartet.');
    else if (value.state === 'export_pending')
      set('delivery_pending', -1, 'Technische Bereitstellung noch offen', 'Ergebnisordner und Zugriffsrechte prüfen. Das ist noch kein abgeschlossener KI-Export.');
    else if (value.state === 'export_abandoned')
      set('delivery_abandoned', -1, 'Bereitstellung dieses Laufs aufgegeben', 'Fehlende Dateien werden nicht mehr automatisch kopiert. Teilkopien bleiben unverändert; keine vollständige Ergebnis- oder KI-Freigabe.');
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
    if (['RESIDUAL_PII', 'AMBIGUITY_REVIEW_REQUIRED'].includes(code)) return 'Für diese Datei wurde kein freigabefähiger Prüfstand erstellt. Sie einzeln neu anonymisieren; bei erneutem Halt den Fehlercode über „Diagnose öffnen“ prüfen. Nicht an KI weitergeben.';
    if (code === 'LOCAL_MAPPING_PENDING') return 'Den zugehörigen Lauf fortsetzen, um genau diese Bereitstellung erneut abzugleichen.';
    return 'Den gespeicherten Laufstatus und die inhaltsfreie Diagnose prüfen. Nicht blind neu starten; die genaue Ursache ist noch nicht bestätigt.';
  }
  const api = Object.freeze({ projectRun, failureAdvice, validateConversionFeedback, conversionSummary });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.defineProperty(window, '__DATASECURE_PRESENTATION__', { value: api });
})();
