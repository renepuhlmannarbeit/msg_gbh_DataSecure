'use strict';

// Reader-owned OMML source fragments -> ordinary Office content Markdown.
// No XML/Markdown parser, inferred header, identity dictionary or new wire
// capability. Only the existing closed producer's source values become cells;
// generated mathematical roles stay prose outside those cells.
const {types}=require('node:util');
const {assertXmlCharacters}=require('./xml-reader');
const {isOfficeMathResult,officeMathSourceScopes}=require('./office-math');
const {isProtectedFieldHeader}=require('./privacy/field-value-coverage');
const {CONTENT_PERSON_FIELD_POLICY}=require('./core/person-field-policy');
const MAX_OUTPUT_CHARS=8000000;
const MAX_SPANS=100000;
function fallback(limit=false){const code=limit?'OFFICE_MATH_PROJECTION_LIMIT':'OFFICE_MATH_PROJECTION_INVALID';return Object.assign(new Error(code),{code});}
function actualFieldPrefix(value){
  // Only actual source before a formula/operand, never generated role text.
  // Reuse the existing closed policy and suffix semantics, not another name
  // detector, heading guess or new privacy regex in the producer.
  let start=0;
  for(let index=0;index<value.length;index++)if(value[index]===':'||value[index]==='='){
    if(isProtectedFieldHeader(value.slice(start,index).trim(),CONTENT_PERSON_FIELD_POLICY))return true;
    start=index+1;
  }
  return false;
}
function projector(escapeText,errorFactory){
  const error=limit=>typeof errorFactory==='function'?errorFactory(limit):fallback(limit);
  function fail(limit=false){throw error(limit);}
  if(typeof escapeText!=='function'||errorFactory!==undefined&&typeof errorFactory!=='function')fail();
  const parts=[];let length=0;
  const validate=value=>assertXmlCharacters(value,()=>error(false));
  function append(value){
    if(typeof value!=='string')fail();
    if(!value)return;
    const count=value.length+(parts.length?2:0);
    if(count>MAX_OUTPUT_CHARS-length)fail(true);
    validate(value);
    length+=count;parts.push(value);
  }
  function escaped(value,inCell){const result=escapeText(value,inCell);if(typeof result!=='string')fail();return result;}
  function sourceCell(value){if(value.length)append('| Inhalt |\n| --- |\n| '+escaped(value,true)+' |');}
  function formula(result){
    if(!isOfficeMathResult(result))fail();
    if(result.segments.map(value=>value.text).join('')!==result.rawText)fail();
    const context=officeMathSourceScopes(result);if(!context||context.groups.length!==result.segments.length)fail();
    const groups=new Map();
    for(let index=0;index<result.segments.length;index++)if(result.segments[index].kind==='source'){
      const group=context.groups[index],scope=context.scopes[group];
      if(!Number.isSafeInteger(group)||group<0||!Number.isSafeInteger(scope)||scope<0)fail();
      if(!groups.has(group))groups.set(group,{scope,parts:[]});groups.get(group).parts.push(result.segments[index].text);
    }
    // Only real operand ancestry can extend a field into a nested formula.
    // It cannot reach an outer sibling denominator. Direct source fragments
    // are already joined across warning/format wrappers, but not across a
    // real child operand. Closed fields stay open to that actual operand's
    // end, without reclassifying an unrelated sibling's technical content.
    const fields=new Map(),owners=new Map(),values=new Map();
    for(const [group,value]of groups){
      const text=value.parts.join('');let owner=null,scope=value.scope;
      for(let depth=0;scope!==null;depth++){
        if(depth>64||!Number.isSafeInteger(scope)||scope<0||scope>=context.parents.length)fail();
        if(fields.has(scope)){owner=fields.get(scope);break;}
        scope=context.parents[scope];
      }
      if(owner===null&&actualFieldPrefix(text)){fields.set(value.scope,group);owner=group;}
      const key=owner===null?group:owner;owners.set(group,key);
      if(!values.has(key))values.set(key,[]);values.get(key).push(text);
    }
    const emitted=new Set();
    for(let index=0;index<result.segments.length;index++){
      const segment=result.segments[index];
      if(segment.kind==='source'){
        const owner=owners.get(context.groups[index]);if(emitted.has(owner))continue;
        sourceCell(values.get(owner).join('\n'));emitted.add(owner);
      }else if(segment.kind==='generated')append(escaped(segment.text,false));
      else fail();
    }
  }
  return {fail,validate,append,escaped,sourceCell,formula,finish:()=>parts.join('\n\n')};
}
function mathMarkdown(result,escapeText,errorFactory){
  const output=projector(escapeText,errorFactory);output.formula(result);return output.finish();
}
function dataRecord(value,keys,fail){
  if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)fail();
  const fields=Object.getOwnPropertyDescriptors(value),actual=Reflect.ownKeys(fields);
  if(actual.length!==keys.length||keys.some(key=>!Object.hasOwn(fields,key)||!Object.hasOwn(fields[key],'value'))||actual.some(key=>typeof key!=='string'))fail();
  return Object.fromEntries(keys.map(key=>[key,fields[key].value]));
}
function mathParagraphMarkdown(raw,spans,escapeText,errorFactory){
  const output=projector(escapeText,errorFactory),fail=output.fail;
  if(typeof raw!=='string')fail();
  if(raw.length>MAX_OUTPUT_CHARS)fail(true);
  output.validate(raw);
  if(types.isProxy(spans)||!Array.isArray(spans)||Object.getPrototypeOf(spans)!==Array.prototype)fail();
  const count=Object.getOwnPropertyDescriptor(spans,'length')?.value;
  if(!Number.isSafeInteger(count)||count<0||count>MAX_SPANS)fail(count>MAX_SPANS);
  const fields=Object.getOwnPropertyDescriptors(spans);
  // Do not execute getters, accept sparse arrays, or silently ignore custom
  // properties on a provenance vector supplied to this private boundary.
  if(Reflect.ownKeys(fields).length!==count+1)fail();
  let cursor=0;const validated=[];
  for(let index=0;index<count;index++){
    const field=fields[String(index)];if(!field||!Object.hasOwn(field,'value'))fail();
    const span=dataRecord(field.value,['start','end','result'],fail);
    if(!Number.isSafeInteger(span.start)||!Number.isSafeInteger(span.end)||span.start<cursor||span.end<span.start||span.end>raw.length||
       !isOfficeMathResult(span.result)||raw.slice(span.start,span.end)!==span.result.rawText)fail();
    validated.push(span);cursor=span.end;
  }
  // A genuine prose fragment's sensitive label owns the remaining paragraph
  // value, including its following formula. Earlier independent math is not
  // part of that value. This is distinct from Name: authored inside one
  // argument, which formula() projects without widening its sibling scope.
  // Validate EVERY span first; a label never excuses malformed provenance.
  cursor=0;
  for(const span of validated){
    const prose=raw.slice(cursor,span.start);
    if(actualFieldPrefix(prose)){output.sourceCell(raw.slice(cursor));return output.finish();}
    output.append(output.escaped(prose,false));
    output.formula(span.result);cursor=span.end;
  }
  const tail=raw.slice(cursor);
  if(validated.length&&actualFieldPrefix(tail))output.sourceCell(tail);
  else output.append(output.escaped(tail,false));
  return output.finish();
}
module.exports=Object.freeze({mathMarkdown,mathParagraphMarkdown,MAX_OUTPUT_CHARS});
