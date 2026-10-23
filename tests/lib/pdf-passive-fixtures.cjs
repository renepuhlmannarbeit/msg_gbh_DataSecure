'use strict';

// Tiny, wholly synthetic PDF objects. Values are never read from user files.
// The returned bytes are RAM test fixtures, not repaired/flattened documents.
function pdfString(value) {
  if (/^[\x20-\x7e]*$/u.test(value)) return `(${value.replace(/([\\()])/gu, '\\$1')})`;
  const bytes = Buffer.from(value, 'utf16le'); bytes.swap16(); return `<feff${bytes.toString('hex')}>`;
}
function buildPdf(objects, root = 1) {
  const parts = [Buffer.from('%PDF-1.7\n')], offsets = [0]; let size = parts[0].length;
  objects.forEach((source, index) => {
    offsets.push(size); const part = Buffer.from(`${index + 1} 0 obj\n${source}\nendobj\n`); parts.push(part); size += part.length;
  });
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Root ${root} 0 R /Size ${objects.length + 1} >>\nstartxref\n${size}\n%%EOF\n`));
  return Buffer.concat(parts);
}
function stream(text, dictionary = '') { return `<< /Length ${Buffer.byteLength(text)} ${dictionary} >>\nstream\n${text}\nendstream`; }
function passivePdf({ fields = [], comments = [], pages = 1, body = 'BODY_NATIVE', docAction = false, xfa = false } = {}) {
  const objects = ['', ''], add = value => { objects.push(value); return objects.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [], annotationIds = [];
  for (let index = 0; index < pages; index++) {
    pageIds.push(add('')); annotationIds.push([]);
  }
  const roots = [];
  for (const spec of fields) {
    const name = spec.name ?? 'Name', type = spec.type || 'Tx', page = spec.page || 0;
    const values = Array.isArray(spec.value) ? spec.value : [spec.value ?? 'Qvx'];
    let value = type === 'Btn' ? `/${values[0]}` : values.length > 1 ? `[${values.map(pdfString).join(' ')}]` : pdfString(values[0]);
    const flags = spec.password ? 8192 : type === 'Btn' && spec.radio ? 32768 : type === 'Btn' && spec.push ? 65536 : type === 'Ch' && values.length > 1 ? 2097152 : 0;
    const options = type === 'Ch' ? `/Opt [${(spec.options || values.map(value => [value, value])).map(pair => `[${pair.map(pdfString).join(' ')}]`).join(' ')}]` : '';
    const action = spec.action ? '/AA << /K << /S /JavaScript /JS (ACTIVE_CODE_DO_NOT_COPY) >> >>' : '';
    if (type === 'Sig') value = '<< /Type /Sig /Name (SIGNATURE_SECRET) >>';
    const parent = spec.parent ? add('') : null, widgets = [];
    for (let index = 0; index < (spec.widgets || 1); index++) {
      const targetPage = spec.repeatPages ? index % pages : page;
      const displayed = spec.appearance === undefined ? values.join(' ') : spec.appearance;
      const appearance = displayed === null ? null : add(stream(`BT /F1 16 Tf 3 8 Td ${pdfString(displayed)} Tj ET`,
        `/Type /XObject /Subtype /Form /BBox [0 0 300 35] /Resources << /Font << /F1 ${font} 0 R >> >>`));
      let ap = appearance ? `/AP << /N ${type === 'Btn' ? `<< /Off ${appearance} 0 R /Yes ${appearance} 0 R >>` : `${appearance} 0 R`} >>` : '';
      if (type === 'Btn') ap += ' /AS /Yes';
      const own = parent ? `/Parent ${parent} 0 R` : `/FT /${type} /T ${pdfString(name)} ${spec.omitValue ? '' : `/V ${value}`} /Ff ${flags} ${options} ${action}`;
      const widget = add(`<< /Type /Annot /Subtype /Widget ${own} /Rect [20 ${150 - index * 45} 320 ${185 - index * 45}] /P ${pageIds[targetPage]} 0 R ${ap} >>`);
      annotationIds[targetPage].push(widget); widgets.push(widget);
      if (!parent && !spec.orphan) roots.push(widget);
    }
    if (parent) {
      objects[parent - 1] = `<< /FT /${type} /T ${pdfString(name)} ${spec.omitValue ? '' : `/V ${value}`} /Ff ${flags} ${options} ${action} /Kids [${widgets.map(id => `${id} 0 R`).join(' ')}] >>`;
      roots.push(parent);
    }
    if (spec.canonicalValue !== undefined) {
      const canonical = add(`<< /Type /Annot /Subtype /Widget /FT /${type} /T ${pdfString(name)} /V ${pdfString(spec.canonicalValue)} /Rect [20 150 320 185] >>`);
      roots.push(canonical);
    }
  }
  for (const spec of comments) {
    const page = spec.page || 0, subtype = spec.type || 'Text';
    const appearance = spec.appearance === undefined ? null : add(stream(`BT /F1 16 Tf 3 8 Td ${pdfString(spec.appearance)} Tj ET`,
      `/Type /XObject /Subtype /Form /BBox [0 0 300 35] /Resources << /Font << /F1 ${font} 0 R >> >>`));
    const annotation = add(`<< /Type /Annot /Subtype /${subtype} /Rect [20 80 320 115] /P ${pageIds[page]} 0 R /Contents ${pdfString(spec.value || '')} /T ${pdfString(spec.author || '')} ${appearance ? `/AP << /N ${appearance} 0 R >>` : ''} ${spec.link ? '/A << /S /URI /URI (https://invalid.test/NO_FETCH) >>' : ''} >>`);
    annotationIds[page].push(annotation);
  }
  pageIds.forEach((id, index) => {
    const contents = add(stream(body ? `BT /F1 18 Tf 20 250 Td ${pdfString(body)} Tj ET` : ''));
    objects[id - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contents} 0 R /Annots [${annotationIds[index].map(id => `${id} 0 R`).join(' ')}] >>`;
  });
  const xfaData = xfa ? add(stream('<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"><xfa:data><Name>XFA_SECRET_VALUE</Name></xfa:data></xfa:datasets>')) : null;
  const form = add(`<< /Fields [${roots.map(id => `${id} 0 R`).join(' ')}] /DR << /Font << /F1 ${font} 0 R >> >> /DA (/F1 16 Tf 0 g) ${xfaData ? `/XFA [(datasets) ${xfaData} 0 R]` : ''} >>`);
  objects[0] = `<< /Type /Catalog /Pages 2 0 R /AcroForm ${form} 0 R ${docAction ? '/OpenAction << /S /JavaScript /JS (DOCUMENT_ACTION_DO_NOT_EXECUTE) >>' : ''} >>`;
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages} >>`;
  return buildPdf(objects);
}
module.exports = Object.freeze({ pdfString, buildPdf, passivePdf });
