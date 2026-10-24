'use strict';
const {sourceColumnFieldLabel}=require('./office-table-projection');

// Real TablePart range + one-based column metadata -> real worksheet cell
// roles. No fake worksheet header/row is manufactured and no raw value copied.
function xlsxSourceColumnFields(model){
 const columns=new Map();let work=0;
 const limit=()=>{if(++work>1000000)throw Object.assign(new Error('XLSX_STRUCTURE_LIMIT'),{code:'XLSX_STRUCTURE_LIMIT'});};
 for(const table of model?.tables||[]){
  const range=/^[A-Z]+([1-9][0-9]*)(?::[A-Z]+([1-9][0-9]*))?$/u.exec(table.reference);
  if(!range)throw Object.assign(new Error('XLSX_STRUCTURE_UNSAFE'),{code:'XLSX_STRUCTURE_UNSAFE'});
  const first=Number(range[1]),last=Number(range[2]||range[1]);
  for(const column of table.columns){limit();const label=sourceColumnFieldLabel(column.name);if(!label)continue;
   const index=column.column-1;if(!columns.has(index))columns.set(index,[]);columns.get(index).push({first,last,label});
  }
 }
 if(!columns.size)return null;
 return (row,cell)=>{
  const labels=new Set();let covered=0;
  for(let index=cell.column;index<cell.column+cell.span;index++){
   limit();let selected=false;for(const interval of columns.get(index)||[]){limit();if(row.number>=interval.first&&row.number<=interval.last){labels.add(interval.label);selected=true;}}
   if(selected)covered++;
  }
  return !labels.size?null:covered===cell.span&&labels.size===1?[...labels][0]:'Geschützter Tabellenwert';
 };
}

// Private, already package/owner-bound context -> ordinary source Markdown.
// Coordinate labels never prefix actual raw Name:/contact source payload.
function xlsxContextSections(model,escape){
 const sections=[];let count=0,chars=0;
 function append(part,markdown){
  if(++count>200000||markdown.length+2>8000000-chars)throw Object.assign(new Error('XLSX_STRUCTURE_LIMIT'),{code:'XLSX_STRUCTURE_LIMIT'});
  chars+=markdown.length+2;sections.push({kind:'text',source_part:part,markdown});}
 function add(part,label,value){if(typeof value!=='string'||!value.length)return;
  if(value.length>8000000-chars)throw Object.assign(new Error('XLSX_STRUCTURE_LIMIT'),{code:'XLSX_STRUCTURE_LIMIT'});
  append(part,label+'\n\n| Inhalt |\n| --- |\n| '+escape(value,true)+' |');}
 for(const comment of model.comments){
  add(comment.part,`## Zellkommentar · ${comment.cell} · Autor`, 'Autor: '+comment.author);
  add(comment.part,`Zellkommentar · ${comment.cell} · Quelltext`,comment.text);
 }
 for(const table of model.tables){const label=`## Tabellenkontext · ${table.reference}`;
  add(table.part,label+' · Bezeichnung',table.name);if(table.displayName!==table.name)add(table.part,label+' · Anzeigename',table.displayName);
  append(table.part,`Tabellenbereich ${table.reference}: ${table.headerRowCount} gespeicherte Kopfzeile(n), ${table.totalsRowCount} Ergebniszeile(n). Gespeicherte Struktur, keine Neuberechnung.`);
  for(const column of table.columns){const at=`Tabellenspalte ${column.column} · Quell-ID ${column.id}`;add(table.part,at+' · Bezeichnung',column.name);
   for(const key of ['totalsRowLabel','totalsRowFunction','calculatedColumnFormula','totalsRowFormula'])if(column[key]!==undefined)add(table.part,at+' · '+({totalsRowLabel:'Ergebnisbeschriftung',totalsRowFunction:'Ergebnisfunktion',calculatedColumnFormula:'Gespeicherte Spaltenformel (nicht ausgeführt)',totalsRowFormula:'Gespeicherte Ergebnisformel (nicht ausgeführt)'})[key],column[key]);}
  if(table.filters.length)append(table.part,'Gespeicherte Tabellenfilter vorhanden; Kriterien wurden nicht neu ausgewertet und keine ausgefilterten Cachewerte ergänzt.');
 }
 for(const pivot of model.pivots){const label=`## Pivotkontext · ${pivot.reference}`;add(pivot.part,label+' · Bezeichnung',pivot.name);
  append(pivot.part,`Gespeicherter Pivotbereich ${pivot.reference}; Zeilen-Gesamtergebnis ${pivot.rowGrandTotals?'an':'aus'}, Spalten-Gesamtergebnis ${pivot.columnGrandTotals?'an':'aus'}. Keine Aktualisierung oder Übernahme alter Cachewerte.`);
  for(const field of pivot.fields){add(pivot.part,`Pivotquellfeld ${field.index} · Bezeichnung`,field.name);if(field.caption!==undefined)add(pivot.part,`Pivotquellfeld ${field.index} · Anzeige`,field.caption);}
  for(const axis of ['rows','columns','pages','data'])for(const field of pivot.axes[axis]){
   const index=typeof field==='object'?field.field:field,role={rows:'Zeilenachse',columns:'Spaltenachse',pages:'Seitenfilter',data:'Datenachse'}[axis];
   append(pivot.part,`${role}: ${index==='data-axis'?'Datenachse':`Quellfeld ${index}`}.`);
   if(field&&typeof field==='object'){if(field.name!==undefined)add(pivot.part,role+' · Gespeicherte Beschriftung',field.name);if(field.subtotal!==undefined)add(pivot.part,role+' · Aggregationsart (nicht berechnet)',field.subtotal);}
  }
  if(pivot.source.type==='worksheet'){if(pivot.source.sheet!==undefined)add(pivot.part,'Pivotquellblatt',pivot.source.sheet);if(pivot.source.name!==undefined)add(pivot.part,'Pivotquellbezeichnung',pivot.source.name);
   if(pivot.source.reference)append(pivot.part,'Gespeicherter Pivotquellbereich '+pivot.source.reference+'.');}
 }
 for(const value of model.richValues)if(value.status==='local-image'&&value.altText)add(model.sourcePart,`## Quellzelle ${value.cell} · Bild-Alternativtext (kein OCR-Nachweis)`,value.altText);
 return sections;
}
module.exports=Object.freeze({xlsxContextSections,xlsxSourceColumnFields});
