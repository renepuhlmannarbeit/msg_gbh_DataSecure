'use strict';
const crypto = require('crypto');
const ORG_SUFFIX = '(?:GmbH(?:\\s*&\\s*Co\\.?\\s*KG)?|AG|SE|KG|OHG|GbR|e\\.?V\\.?|B\\.?V\\.?|Ltd\\.?|Limited|Inc\\.?|LLC|SAS|SARL|S\\.?A\\.?|PLC|UG(?:\\s*\\(haftungsbeschränkt\\))?)';
const COMPANY_RE = new RegExp(`\\b([A-ZÄÖÜ][A-Za-z0-9ÄÖÜäöüß&.'’+\\-/]*(?:[ \\t]+[A-ZÄÖÜ0-9][A-Za-z0-9ÄÖÜäöüß&.'’+\\-/]*){0,7}[ \\t]+${ORG_SUFFIX})\\b`, 'gu');
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()]+|\b[a-z0-9][a-z0-9.-]+\.(?:de|com|net|org|eu|io|ai|ch|at|nl|fr|uk)\b/giu;
const EMAIL_RE = /\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/giu;
const PHONE_RE = /(?<!\w)(?:\+\d{1,3}[\s./-]?)?(?:\(?\d{2,5}\)?[\s./-]?)\d{3,5}[\s./-]\d{2,6}(?:[\s./-]\d{1,6})?(?!\w)/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g;
const BIC_RE = /\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g;
const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const POSTAL_ADDRESS_RE = /\b\d{5}\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'’\-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'’\-]+){0,3}\b/g;
const DE_TAX_RE = /\b\d{11}\b/g;
const DE_SV_RE = /\b\d{2}\s?\d{6}\s?[A-Z]\s?\d{2}\s?\d\b/g;
const CREDIT_RE = /\b(?:\d[ -]?){13,19}\b/g;
const ROLE_WORDS = new Set(['GMBH','AG','SE','KG','OHG','GBR','UG','LTD','LIMITED','INC','LLC','SAS','SARL','PLC','VERTRAGSPARTEI','PRODUCT','OWNER','SCRUM','MASTER','BUSINESS','ANALYST','COACH','AGILE','SOFTWARE','ENTWICKLER','ENGINEER','CONSULTANT','MANAGER','OFFICER','QUALIFIKATIONEN','PROJEKTERFAHRUNG','BERUFSERFAHRUNG','SKILLSET','ZERTIFIZIERUNGEN','SPRACHKENNTNISSE','BRANCHENKENNTNISSE','TECHNOLOGIEN','METHODEN','AUFGABEN','VERANTWORTLICHKEITEN']);
const ORG_ALLOW = new Set(['SCRUM.ORG','MICROSOFT','SAP','ATLASSIAN','JIRA','CONFLUENCE','MIRO','SAFe','IHK']);
function normalizeSpaces(s){return String(s||'').replace(/\s+/g,' ').trim();}
function key(s){return normalizeSpaces(s).toLocaleLowerCase('de-DE');}
function hashShort(s){return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,10);}
function replaceAllInsensitive(text, needle, repl){if(!needle)return text;const esc=needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return text.replace(new RegExp(esc,'giu'),repl);}
function lines(text){return String(text||'').split(/\r?\n/);}
function looksName(s){s=normalizeSpaces(s); if(!s||s.length>80)return false; const toks=s.split(/\s+/); if(toks.length<2||toks.length>4)return false;if(toks.some(t=>ROLE_WORDS.has(t.toUpperCase())))return false;return toks.every(t=>/^[A-ZÄÖÜÀ-Ý][A-Za-zÀ-ÖØ-öø-ÿÄÖÜäöüß'’\-]{1,30}$/.test(t) || /^[A-ZÄÖÜÀ-Ý]{2,30}$/.test(t));}
module.exports={ORG_SUFFIX,COMPANY_RE,URL_RE,EMAIL_RE,PHONE_RE,IBAN_RE,BIC_RE,IP_RE,POSTAL_ADDRESS_RE,DE_TAX_RE,DE_SV_RE,CREDIT_RE,ROLE_WORDS,ORG_ALLOW,normalizeSpaces,key,hashShort,replaceAllInsensitive,lines,looksName};
