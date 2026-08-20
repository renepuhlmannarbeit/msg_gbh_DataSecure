'use strict';
const fs=require('fs');const path=require('path');const os=require('os');
const {parseOoxml}=require('./ooxml');const {parsePdf}=require('./pdf-lite');const {rasterizeToPng,ocrPngDetailed}=require('./windows-visual');
class SafeError extends Error{}
function dataRoot(){return path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'ClaudeEUPrivacyDocumentGatewayV32');}
function runtimeReady(){return true;}
function readStatus(){return{phase:'ready',message:'Bundled offline privacy engine ready.'};}
async function convertDocument(source){const ext=path.extname(source).toLowerCase();const buf=fs.readFileSync(source);try{if(['.docx','.xlsx','.pptx'].includes(ext))return parseOoxml(buf,ext);if(ext==='.pdf')return parsePdf(buf);if(ext==='.md'||ext==='.txt')return{markdown:buf.toString('utf8'),attachments:[],warnings:[]};if(ext==='.csv')return{markdown:'# Tabelleninhalt\n\n```csv\n'+buf.toString('utf8').replace(/```/g,'` ` `')+'\n```',attachments:[],warnings:[]};throw new SafeError('Nicht unterstütztes Format.');}catch(e){if(e instanceof SafeError)throw e;throw new SafeError(`Die ${ext.replace('.','').toUpperCase()}-Datei konnte nicht sicher lokal gelesen werden: ${String(e.message||e).slice(0,240)}`);}}
module.exports={SafeError,dataRoot,runtimeReady,readStatus,convertDocument,rasterizeToPng,ocrPngDetailed};
