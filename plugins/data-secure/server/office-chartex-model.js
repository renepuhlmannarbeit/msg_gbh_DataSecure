'use strict';

// MS-ODRAWXML chartEx caches. No workbook resolver, formula evaluation,
// geographical lookup, histogram calculation or native Office dependency.
const { selectedChartTree } = require('./office-chart-model');
const { assertXmlCharacters } = require('./xml-reader');
const { isProtectedFieldHeader } = require('./privacy/field-value-coverage');
const { CONTENT_PERSON_FIELD_POLICY } = require('./core/person-field-policy');
const CX='http://schemas.microsoft.com/office/drawing/2014/chartex';
const A=new Set(['http://schemas.openxmlformats.org/drawingml/2006/main','http://purl.oclc.org/ooxml/drawingml/main']);
const LAYOUTS=new Set(['boxWhisker','clusteredColumn','funnel','paretoLine','regionMap','sunburst','treemap','waterfall']);
const STR=new Set(['cat','colorStr','entityId']),NUM=new Set(['val','x','y','size','colorVal']);
const MAX_POINTS=200000,MAX_LEVELS=64,MAX_SERIES=4096,MAX_CHARS=8000000;
const attr=(node,key)=>node?.attributes.get(`{}${key}`);
const is=(node,name)=>node?.namespaceURI===CX&&node.localName===name;
const children=(node,name)=>node?.children.filter(child=>is(child,name))||[];
function once(node,name,error){const values=children(node,name);if(values.length>1)throw error();return values[0];}
function uint(value,error){if(typeof value!=='string'||!/^\d+$/u.test(value)||Number(value)>4294967295)throw error();return Number(value);}
function readOfficeChartEx(xml,decode,error){
 const root=selectedChartTree(xml,decode,error,new Set([CX,...A]));
 if(!is(root,'chartSpace'))throw error();
 const issues=new Set(),used=new WeakSet(),data=new Map(),axes=[],series=[];let points=0;
 // CT_StringValue is xsd:string, NOT Excel ST_Xstring. Literal _x0041_
 // therefore remains literal. XML entities were already decoded exactly once.
 const string=value=>{const text=String(value);assertXmlCharacters(text,error);return text;};
 const scalar=node=>{if(!node)return '';if(node.children.length)throw error();used.add(node);return string(node.text);};
 const boolean=(value,fallback=false)=>{if(value===undefined)return fallback;if(!['0','1','true','false'].includes(value))throw error();return value==='1'||value==='true';};
 const formula=node=>{if(!node)return null;const dir=attr(node,'dir');if(dir!==undefined&&!['row','col'].includes(dir))throw error();return {value:scalar(node),dir};};
 const text=node=>{
  if(!node)return {value:'',source:null};
  const cache=once(node,'txData',error),rich=once(node,'rich',error);if(cache&&rich)throw error();
  if(cache){const value=once(cache,'v',error);if(!value)issues.add('TEXT_CACHE_MISSING');return {value:scalar(value),source:formula(once(cache,'f',error))};}
  if(rich){const paragraphs=[];for(const paragraph of rich.children.filter(child=>A.has(child.namespaceURI)&&child.localName==='p')){
   const parts=[];for(const run of paragraph.children){if(A.has(run.namespaceURI)&&run.localName==='br')parts.push('\n');
    else if(A.has(run.namespaceURI)&&['r','fld'].includes(run.localName))for(const value of run.children.filter(child=>A.has(child.namespaceURI)&&child.localName==='t'))parts.push(scalar(value));}
   paragraphs.push(parts.join(''));}return {value:paragraphs.join('\n\n'),source:null};}
  if(node.children.length)issues.add('CONTENT_UNMODELED');return {value:'',source:null};
 };
 const chartData=once(root,'chartData',error),chart=once(root,'chart',error),plot=once(chart,'plotArea',error),region=once(plot,'plotAreaRegion',error);
 if(!chartData||!chart||!plot||!region)issues.add('MODEL_INCOMPLETE');
 if((attr(root,'version')!==undefined&&attr(root,'version')!=='0.0')||attr(root,'featureList')||children(root,'dashboard').length)issues.add('FEATURE_UNMODELED');
 if(once(chartData,'externalData',error))issues.add('EXTERNAL_DATA');
 for(const source of children(chartData,'data')){
  const id=uint(attr(source,'id'),error);if(data.has(id))throw error();
  const dimensions=[];
  for(const dimension of source.children.filter(node=>is(node,'strDim')||is(node,'numDim'))){
   if(dimensions.length>=64)throw error(true);
   const numeric=is(dimension,'numDim'),type=attr(dimension,'type');if(!(numeric?NUM:STR).has(type)){issues.add('DIMENSION_UNMODELED');continue;}
   const levelNodes=children(dimension,'lvl');if(levelNodes.length>MAX_LEVELS)throw error(true);
   const levels=levelNodes.map(level=>{
    const count=uint(attr(level,'ptCount'),error),values=new Map();
    for(const point of children(level,'pt')){if(++points>MAX_POINTS)throw error(true);const idx=uint(attr(point,'idx'),error);
     if(idx>=count||values.has(idx))throw error();const value=scalar(point);
     if(numeric&&!/^[ \t\r\n]*(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?|INF|-INF|NaN)[ \t\r\n]*$/u.test(value))throw error();
     if(numeric&&/^[ \t\r\n]*(?:INF|-INF|NaN)[ \t\r\n]*$/u.test(value))issues.add('NONFINITE_VALUE');
     values.set(idx,value);}
    if(values.size<count)issues.add('CACHE_GAPS');
    return {count,values,name:attr(level,'name')===undefined?null:string(attr(level,'name')),format:attr(level,'formatCode')===undefined?null:string(attr(level,'formatCode'))};
   });
   if(!levels.length)issues.add('CACHE_MISSING');
   dimensions.push({numeric,type,levels,source:formula(once(dimension,'f',error)),nameSource:formula(once(dimension,'nf',error))});
  }
  if(!dimensions.length)issues.add('CACHE_MISSING');data.set(id,{id,dimensions});
 }
 const title=text(once(once(chart,'title',error),'tx',error));
 for(const axis of children(plot,'axis')){
  const id=uint(attr(axis,'id'),error);if(axes.some(value=>value.id===id))throw error();
  const cat=once(axis,'catScaling',error),val=once(axis,'valScaling',error);if(cat&&val)throw error();
  if(!cat&&!val)issues.add('AXIS_ROLE_UNRESOLVED');
  const units=once(axis,'units',error),format=once(axis,'numFmt',error);
  axes.push({id,kind:cat?'cat':val?'val':null,title:text(once(once(axis,'title',error),'tx',error)),hidden:boolean(attr(axis,'hidden')),
   unit:attr(units,'unit'),unitLabel:text(once(once(units,'unitsLabel',error),'tx',error)),format:attr(format,'formatCode')});
 }
 const usedData=new Set();
 for(const source of children(region,'series')){
  if(series.length>=MAX_SERIES)throw error(true);
  const layout=attr(source,'layoutId');if(!LAYOUTS.has(layout))issues.add('LAYOUT_UNMODELED');
  const dataIdNode=once(source,'dataId',error),id=dataIdNode?uint(attr(dataIdNode,'val'),error):null;
  if(id===null||!data.has(id))issues.add('DATA_BINDING_MISSING');else usedData.add(id);
  const axisIds=children(source,'axisId').map(node=>uint(scalar(node),error));
  if(new Set(axisIds).size!==axisIds.length)throw error();
  const properties=[],layoutPr=once(source,'layoutPr',error);
  for(const name of ['binning','statistics','subtotals','aggregation','geography']){
   const node=once(layoutPr,name,error);if(!node)continue;
   if(name==='geography'){issues.add('GEOGRAPHY_NOT_RENDERED');continue;}
   if(name==='aggregation')properties.push(['aggregation','gespeichert; nicht berechnet']);
   if(name==='binning'){for(const key of ['intervalClosed','underflow','overflow'])if(attr(node,key)!==undefined)properties.push([`binning · ${key}`,string(attr(node,key))]);
    const size=once(node,'binSize',error),count=once(node,'binCount',error);if(size&&count)throw error();if(size)properties.push(['binSize',scalar(size)]);if(count)properties.push(['binCount',String(uint(scalar(count),error))]);}
   if(name==='statistics'&&attr(node,'quartileMethod')!==undefined)properties.push(['quartileMethod',string(attr(node,'quartileMethod'))]);
   if(name==='subtotals')for(const idx of children(node,'idx'))properties.push(['Subtotal · Quellpunktindex',String(uint(attr(idx,'val'),error))]);
  }
  series.push({layout:LAYOUTS.has(layout)?layout:null,title:text(once(source,'tx',error)),id,data:data.get(id),axisIds,properties,hidden:boolean(attr(source,'hidden')),
   owner:attr(source,'ownerIdx')===undefined?null:uint(attr(source,'ownerIdx'),error)});
 }
 if(!series.length)issues.add('MODEL_INCOMPLETE');
 const states=new Map();
 for(let index=0;index<series.length;index++){
  let current=index;const chain=[];
  while(current!==null&&states.get(current)!==2){
   if(current>=series.length||states.get(current)===1){issues.add('SERIES_OWNER_UNRESOLVED');break;}
   states.set(current,1);chain.push(current);current=series[current].owner;
  }
  for(const visited of chain)states.set(visited,2);
 }
 for(const id of data.keys())if(!usedData.has(id))issues.add('UNBOUND_DATA');
 // Inspect the entire selected, bounded tree, including late extensions.
 // An arbitrary value/text outside the recognized role is not source authority.
 const pending=[root];while(pending.length){const node=pending.pop();for(const child of node.children)pending.push(child);
  if(!used.has(node)&&node.text.trim()&&(node.namespaceURI===CX||A.has(node.namespaceURI)&&node.localName==='t'))issues.add('CONTENT_UNMODELED');}
 return {title,axes,series,issues,points};
}

function renderOfficeChartEx(model,escape,error){
 const lines=[];let chars=0,sourceValues=0;
 const append=value=>{chars+=value.length+(lines.length?2:0);if(chars>MAX_CHARS)throw error(true);lines.push(value);};
 const metadata=(label,value)=>{if(value===undefined||value===null||value==='')return;sourceValues++;append(`${label}\n\n| Inhalt |\n| --- |\n| ${escape(value)} |`);};
 const title=(label,item)=>{metadata(label,item.value);if(item.source){metadata(`${label} · Bezug (nicht ausgewertet)`,item.source.value);if(item.source.dir)append(`Formelrichtung: ${item.source.dir}`);}};
 const labels={cat:'Kategorie',colorStr:'Farbkategorie',entityId:'Geographische Quellkennung',val:'Wert',x:'X-Wert',y:'Y-Wert',size:'Größe',colorVal:'Farbwert'};
 const axisMap=new Map(model.axes.map(axis=>[axis.id,{...axis,protectedTitle:isProtectedFieldHeader(axis.title.value,CONTENT_PERSON_FIELD_POLICY)}]));
 const context=series=>{
  const axes=series.axisIds.map(id=>axisMap.get(id)),boundAxes=axes.filter(Boolean),protectedAxes=boundAxes.filter(axis=>axis.protectedTitle);
  const role=dimension=>{const roleAxes=boundAxes.filter(axis=>axis.kind===(dimension.type==='cat'?'cat':dimension.type==='val'?'val':null));
   const ambiguous=roleAxes.length>1||(!['cat','val'].includes(dimension.type)&&protectedAxes.length>0)||axes.some(axis=>!axis||axis.kind===null);
   const protectedAxisLabel=roleAxes.length===1&&roleAxes[0].protectedTitle;
   return {ambiguous,protectedAxisLabel,axisLabel:roleAxes.length===1?roleAxes[0].title.value:null,protected: Boolean(ambiguous&&protectedAxes.length||protectedAxisLabel)};};
  return {axes,role,protectedAxes};
 };
 // A data object may be referenced by several real series. Its actual field
 // obligation cannot disappear when a later series supplies a neutral title.
 // Union by the proven object + dimension identity, NEVER by equal raw text.
 const obligations=new Map();
 for(const series of model.series)if(series.data){const ctx=context(series);let set=obligations.get(series.data);if(!set){set=new Set();obligations.set(series.data,set);}
  for(const [index,dimension]of series.data.dimensions.entries())if(ctx.role(dimension).protected)set.add(index);}
 title('Diagrammtitel',model.title);
 for(const axis of model.axes){append(`Achse · ID ${axis.id} · ${axis.kind||'Rolle unbestimmt'}${axis.hidden?' · ausgeblendet':''}`);title('Achsentitel',axis.title);metadata('Achse · gespeicherte Einheit',axis.unit);title('Achse · Einheitenbeschriftung',axis.unitLabel);metadata('Achse · gespeichertes Zahlenformat',axis.format);}
 for(const [ordinal,series]of model.series.entries()){
  append(`chartEx · Layout ${series.layout||'nicht modelliert'} · Serie ${ordinal+1} (Quellreihenfolge) · Daten-ID ${series.id??'fehlt'}${series.hidden?' · ausgeblendet':''}`);
  if(series.owner!==null)append(`Gespeicherter Serienbesitzerindex: ${series.owner} (keine zusätzliche Datenverknüpfung)`);
  title('Serientitel',series.title);for(const [name,value]of series.properties)if(name==='aggregation')append('Layoutparameter: gespeicherte Aggregation; nicht berechnet.');else metadata(`Layoutparameter · ${name}`,value);
  if(!series.data)continue;
  const ctx=context(series),{axes,protectedAxes}=ctx,columns=[],indices=new Set();
  if(axes.some(axis=>!axis))model.issues.add('AXIS_ROLE_UNRESOLVED');
  for(const [dimensionIndex,dimension]of series.data.dimensions.entries()){
   const {ambiguous,protectedAxisLabel,axisLabel,protected:localProtected}=ctx.role(dimension);
   if(ambiguous)model.issues.add('AXIS_ROLE_UNRESOLVED');
   if(dimension.source){metadata(`Datenkanal ${dimension.type} · Quellbezug (nicht ausgewertet)`,dimension.source.value);if(dimension.source.dir)append(`Formelrichtung: ${dimension.source.dir}`);}
   if(dimension.nameSource)metadata(`Datenkanal ${dimension.type} · Namensbezug (nicht ausgewertet)`,dimension.nameSource.value);
   for(const [levelIndex,level]of dimension.levels.entries()){
    metadata(`Datenkanal ${dimension.type} · Ebene ${levelIndex+1} · Quellname`,level.name);metadata(`Datenkanal ${dimension.type} · Ebene ${levelIndex+1} · Zahlenformat (Rohwerte unverändert)`,level.format);
    for(const idx of level.values.keys())indices.add(idx);
    // A cache level's own name is real source context, not a guessed header.
    // Ambiguous sensitive axis obligations stay conservative across channels.
    const sharedProtected=obligations.get(series.data)?.has(dimensionIndex)&&!localProtected&&!isProtectedFieldHeader(level.name||'',CONTENT_PERSON_FIELD_POLICY);
    if(sharedProtected)model.issues.add('SHARED_FIELD_BINDING');
    const label=(ambiguous&&protectedAxes.length)||sharedProtected?'Geschützter Tabellenwert':protectedAxisLabel?axisLabel:level.name||axisLabel||labels[dimension.type];
    columns.push({dimensionIndex,levelIndex,level,type:dimension.type,label});
   }
  }
  if(!indices.size){append('Hinweis: Keine gespeicherten Datenpunkte; keine Formel wurde berechnet.');continue;}
  append('Gespeicherte Datenpunkte dieser Serie (numerische Rohwerte; keine Statistik neu berechnet):');
  const missing=[];const display=(column,idx)=>{if(!column.level.values.has(idx)){missing.push([column.dimensionIndex,column.levelIndex,idx]);return '';}
   const value=column.level.values.get(idx);if(value)sourceValues++;return escape(value);};
  let tableChars=0;const rows=[];const row=value=>{tableChars+=value.length+1;if(tableChars+chars>MAX_CHARS)throw error(true);rows.push(value);};
  // Bound escaped fragments BEFORE joining a potentially amplified row.
  const cells=values=>{const parts=[];let size=4;for(const value of values){size+=value.length+(parts.length?3:0);if(size+tableChars+chars+1>MAX_CHARS)throw error(true);parts.push(value);}row(`| ${parts.join(' | ')} |`);};
  const values=function*(first,project){yield first;for(const column of columns)yield project(column);};
  if(indices.size*columns.length>MAX_POINTS){for(const column of columns){row(`Datenkanal ${column.type} · Dimension ${column.dimensionIndex+1} · Ebene ${column.levelIndex+1}\n`);cells(['Punktindex',escape(column.label)]);row('| --- | --- |');for(const [idx]of [...column.level.values].sort((a,b)=>a[0]-b[0]))cells([String(idx),display(column,idx)]);row('');}}
  else{cells(values('Punktindex',column=>escape(column.label)));cells(values('---',()=>'---'));for(const idx of [...indices].sort((a,b)=>a-b))cells(values(String(idx),column=>display(column,idx)));}
  append(rows.join('\n'));for(const [dimension,level,idx]of missing)append(`Hinweis: Fehlender Cachepunkt · Dimension ${dimension+1} · Ebene ${level+1} · Punktindex ${idx}.`);
  if(columns.some(column=>column.levelIndex>0))append('Hierarchieebenen bleiben in Quellreihenfolge und an ihren Punktindizes; keine Oberkategorie wurde auf andere Indizes übertragen.');
 }
 const messages={MODEL_INCOMPLETE:'Die chartEx-Struktur ist nicht vollständig modelliert.',EXTERNAL_DATA:'Eine verknüpfte Datenquelle wurde nicht gelesen oder aktualisiert; nur gespeicherte Caches werden übernommen.',DIMENSION_UNMODELED:'Eine zusätzliche Datenkanalrolle konnte nicht modelliert werden.',CACHE_GAPS:'Gespeicherte Cachepunkte fehlen; fehlende Werte sind keine Nullwerte.',CACHE_MISSING:'Ein Datenkanal hat keine gespeicherten Werte; keine Formel wurde berechnet.',LAYOUT_UNMODELED:'Ein Layout ist nicht modelliert; seine unabhängig gebundenen Cachewerte bleiben als solche erhalten.',DATA_BINDING_MISSING:'Ein Serienbezug auf die gespeicherten Daten fehlt oder ist nicht auflösbar.',GEOGRAPHY_NOT_RENDERED:'Geographische Form-/Abfragedaten wurden nicht gerendert oder extern aufgelöst.',UNBOUND_DATA:'Nicht an eine tatsächliche Serie gebundene Daten werden nicht als Diagramminhalt ausgegeben.',CONTENT_UNMODELED:'Zusätzliche chartEx-Inhalte wurden nicht als vollständig gelesen ausgegeben.',AXIS_ROLE_UNRESOLVED:'Ein Achsenbezug ist nicht eindeutig; sensible Feldpflichten bleiben konservativ geschützt.'};
 messages.NONFINITE_VALUE='Ein gespeicherter numerischer Sonderwert ist nicht endlich; er bleibt unverändert und wurde nicht berechnet.';
 messages.TEXT_CACHE_MISSING='Ein Titel-/Serienbezug hat keinen gespeicherten Text; die Formel wurde nicht ausgewertet.';
 messages.SHARED_FIELD_BINDING='Derselbe gespeicherte Datenkanal hat in einer anderen tatsächlich gebundenen Serie einen sensiblen Feldbezug; dieser bleibt auch in der weiteren Darstellung geschützt.';
 messages.SERIES_OWNER_UNRESOLVED='Ein Serienbesitzerindex ist außerhalb der Serienliste oder zyklisch; aus ihm wurde keine Datenverknüpfung abgeleitet.';
 messages.FEATURE_UNMODELED='Zusätzliche chartEx-Features oder ein Dashboard sind nicht vollständig modelliert.';
 if(sourceValues)append('Datenstand: gespeicherte chartEx-Caches; keine Formeln, Histogramme, Quartile, Summen oder Karten neu berechnet.');
 for(const issue of model.issues)append(`Hinweis: ${messages[issue]}`);
 return {markdown:lines.join('\n\n'),hasSource:sourceValues>0,issues:[...model.issues]};
}
module.exports=Object.freeze({readOfficeChartEx,renderOfficeChartEx});
