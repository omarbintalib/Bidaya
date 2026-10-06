import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseCsv } from '../../src/data/csv.ts';
import { narrationEntries, normalizeText } from './lib/narration.mjs';
import { elevenLabsArabicText } from './lib/elevenlabs-text.mjs';
const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = resolve(app, 'public/audio/narration');
const localeAt=process.argv.indexOf('--locale');
const locale=localeAt<0?'en':process.argv[localeAt+1];
if(!['en','ar'].includes(locale))throw Error('Choose --locale en or ar');
const name=locale==='ar'?'arabic':'english';
const option=(flag,fallback)=>{const at=process.argv.indexOf(flag);return at<0?fallback:process.argv[at+1];};
const manifest = JSON.parse(readFileSync(resolve(app,option('--manifest','public/audio/narration/manifest.json')), 'utf8'));
const source = narrationEntries(parseCsv(readFileSync(resolve(app, '../data/2_sirah_events.csv'), 'utf8')), parseCsv(readFileSync(resolve(app, '../data/12_dorar_titles_and_texts_ar_en.csv'), 'utf8'))).filter(e=>e.locale===locale);
const audit = JSON.parse(readFileSync(resolve(app,`scripts/audio/audits/${name}.json`),'utf8'));
// Duration from MPEG frames, without decoding or calling any speech API.
function duration(bytes) {
  let at = bytes.subarray(0,3).toString()==='ID3' ? 10 + ((bytes[6]&127)<<21 | (bytes[7]&127)<<14 | (bytes[8]&127)<<7 | bytes[9]&127) : 0;
  let seconds=0, frames=0;
  while(at+4<=bytes.length) {
    const h=bytes.readUInt32BE(at), version=(h>>>19)&3, layer=(h>>>17)&3, rate=(h>>>12)&15, frequency=(h>>>10)&3;
    if ((h>>>21)!==2047 || version===1 || layer!==1 || rate===0 || rate===15 || frequency===3) { at++; continue; }
    const sample=[44100,48000,32000][frequency]/(version===3?1:version===2?2:4);
    const bitrate=(version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[rate]*1000;
    const length=Math.floor((version===3?144:72)*bitrate/sample)+((h>>>9)&1);
    if(at+length>bytes.length) break;
    seconds+=(version===3?1152:576)/sample;frames++;at+=length;
  }
  if(!frames) throw Error('No MPEG audio frames');
  return Math.round(seconds*1000)/1000;
}
const entries={};let totalBytes=0,files=0;
for(const entry of source) {
  const fields=entry.kind==='event'?['sourceTitle','sourceBody','date']:locale==='ar'?['sourceYears']:['text'];
  const sourceHash=createHash('sha256').update(JSON.stringify(fields.map(field=>entry[field]))).digest('hex');
  if(audit[entry.id]!==sourceHash) throw Error(`Source mismatch: ${entry.id}`);
  const audio=manifest.entries[locale+'/'+entry.id];
  if(!audio?.parts?.length) throw Error(`Missing recording: ${entry.id}`);
  if(locale==='ar') {
    const voiceId='Ywuz3KyW2N5pqKNpwcCL',settings={stability:0.5,similarity_boost:0.75,style:0.2,use_speaker_boost:true,speed:1};
    const hash=createHash('sha256').update(JSON.stringify({text:elevenLabsArabicText(entry.text),model:'eleven_v4',voiceId,settings})).digest('hex');
    if(audio.model!=='eleven_v4'||audio.voice!==`elevenlabs:${voiceId}`||audio.hash!==hash)throw Error(`Arabic source/voice mismatch: ${entry.id}`);
  }
  if(locale==='en') {
    const voiceId='MFZUKuGQUsGJPQjTS4wC',settings={stability:0.5,similarity_boost:0.75,style:0.2,use_speaker_boost:true,speed:1};
    const hash=createHash('sha256').update(JSON.stringify({text:normalizeText(entry.text,'en'),model:'eleven_v4',voiceId,settings})).digest('hex');
    if(audio.provider!=='elevenlabs'||audio.model!=='eleven_v4'||audio.voice!==`elevenlabs:${voiceId}`||audio.hash!==hash)throw Error(`English Jon source/voice mismatch: ${entry.id}`);
  }
  const parts=audio.parts.map(path=>{
    if(!new RegExp(`^${locale}/[\\w.-]+\\.mp3$`).test(path)) throw Error(`Unexpected audio path: ${path}`);
    const full=resolve(root,path);if(!existsSync(full)||statSync(full).size<1000) throw Error(`Missing/empty audio: ${path}`);
    const bytes=readFileSync(full);totalBytes+=bytes.length;files++;
    return {path,bytes:bytes.length,duration:duration(bytes)};
  });
  entries[entry.id]={hash:audio.hash,voice:audio.voice,parts};
}
if(source.length!==146 || source.filter(e=>e.kind==='event').length!==142) throw Error('Unexpected collection count');
const output=resolve(app,option('--output',`public/audio/narration/${name}-index.json`));
writeFileSync(output,JSON.stringify({version:1,locale,entries}));
console.log(JSON.stringify({locale,events:142,chapters:4,files,totalBytes,indexBytes:statSync(output).size}));
