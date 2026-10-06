import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseCsv } from '../../src/data/csv.ts';
import { narrationEntries, chunkText } from './lib/narration.mjs';
import { elevenLabsArabicText } from './lib/elevenlabs-text.mjs';
const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const work = resolve(app, 'tmp/narration/elevenlabs/v4');
const root = resolve(app, 'public/audio/narration');
mkdirSync(work, { recursive: true });
for (const line of readFileSync(resolve(app, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
const key = process.env.ELEVENLABS_API_KEY, voiceId = process.env.ELEVENLABS_VOICE_ID;
if (!key || voiceId !== 'Ywuz3KyW2N5pqKNpwcCL') throw Error('Expected the configured Eid voice and API key');
const settings = { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true, speed: 1 };
const headers = { 'xi-api-key': key };
const chars = s => Array.from(s).length;
const atomic = (path, value) => {
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path + '.tmp', JSON.stringify(value, null, 2));
  for (let attempt = 0; ; attempt++) {
    try { renameSync(path + '.tmp', path); return; }
    catch (e) { if (!['EPERM', 'EACCES', 'EBUSY'].includes(e.code) || attempt >= 9) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1)); }
  }
};
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
async function get(endpoint) {
  const r = await fetch('https://api.elevenlabs.io/v1/' + endpoint, { headers, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw Error(`Account/voice read HTTP ${r.status}`);
  return r.json();
}
const removed = [];
const entries = narrationEntries(parseCsv(readFileSync(resolve(app, '../data/2_sirah_events.csv'), 'utf8')), parseCsv(readFileSync(resolve(app, '../data/12_dorar_titles_and_texts_ar_en.csv'), 'utf8')), removed)
  .filter(e => e.locale === 'ar').map(e => ({ id: e.id, kind: e.kind, chapterId: e.kind === 'chapter' ? e.id : `chapter-${e.event.period}`, text: elevenLabsArabicText(e.text), sourceTitle: e.sourceTitle, sourceBody: e.sourceBody, date: e.date, sourceYears: e.sourceYears }));
for (const entry of entries) entry.chunks = chunkText(entry.text, 9000);
atomic(resolve(work, 'transcripts.json'), entries); atomic(resolve(work, 'quran-exclusions.json'), removed);
const mainPath = resolve(root, 'manifest.json'), ownPath = resolve(work, 'manifest.json');
const main = json(mainPath), own = existsSync(ownPath) ? json(ownPath) : {version:1,entries:{}};
const hash = text => createHash('sha256').update(JSON.stringify({ text, model: 'eleven_v4', voiceId, settings })).digest('hex');
const complete = entry => { const r = main.entries['ar/' + entry.id]; return r?.model === 'eleven_v4' && r.voice === `elevenlabs:${voiceId}` && r.hash === hash(entry.text) && r.parts.every(p => existsSync(resolve(root, p)) && readFileSync(resolve(root, p)).length > 1000); };
// Stable naming catalogue includes future filenames, even while a background batch runs.
atomic(resolve(work, 'catalogue.json'), entries.map(e => ({ id:e.id, locale:'ar', kind:e.kind, chapterId:e.chapterId, title:e.sourceTitle ?? e.text, date:e.date ?? null, sourceYears:e.sourceYears ?? null, text:e.text, manifestKey:'ar/'+e.id, parts:e.chunks.map((_,i)=>`ar/${e.id}-v4-api-${hash(e.text).slice(0,12)}${e.chunks.length===1?'':`-${i+1}`}.mp3`) })));
let pending = entries.filter(e => !complete(e));
console.log(JSON.stringify({ total: entries.length, skippedApprovedOrCompleted: entries.length - pending.length, pending: pending.length, pendingCharacters: pending.reduce((n,e)=>n+chars(e.text),0), longest: Math.max(...pending.map(e=>chars(e.text))), model: 'eleven_v4' }));
if (!process.argv.includes('--generate')) process.exit(0);
const initial = await get('user/subscription'), voice = await get('voices/' + encodeURIComponent(voiceId));
if (initial.tier === 'free') throw Error('This batch requires the upgraded account');
const ledgerPath = resolve(work, `usage-${initial.next_character_count_reset_unix}.json`);
const ledger = existsSync(ledgerPath) ? json(ledgerPath) : { requests: [], accountUsedBefore: initial.character_count };
const lockPath = resolve(app, 'tmp/narration/generation.lock');
let lock;
try { lock = openSync(lockPath, 'wx'); } catch { throw Error('Another narration generator is running'); }
writeFileSync(lock, String(process.pid));
process.on('exit', () => { closeSync(lock); try { unlinkSync(lockPath); } catch {} });
process.on('SIGINT', () => process.exit(130)); process.on('SIGTERM', () => process.exit(143));
let stopped = false, failure = null, activeCharacters = 0;
function checkpoint(status = 'running', balance = null) {
  const done = entries.filter(complete), remaining = entries.filter(e => !complete(e));
  atomic(ledgerPath, ledger);
  atomic(resolve(work, 'progress.json'), { status, at: new Date().toISOString(), model: 'eleven_v4', voiceName: voice.name, eventsCompleted: done.filter(e=>e.kind==='event').length, chaptersCompleted: done.filter(e=>e.kind==='chapter').length, pendingEntries: remaining.length, pendingCharacters: remaining.reduce((n,e)=>n+chars(e.text),0), completed: done.map(e=>e.id), pending: remaining.map(e=>e.id), remainingIncludedCredits: balance ? balance.character_limit-balance.character_count : null, failure });
  atomic(resolve(work, 'queue.json'), [...entries.filter(e=>e.kind==='chapter'),...entries.filter(e=>e.kind==='event')].map(e=>({ id:e.id,kind:e.kind,text:e.text,characters:chars(e.text),completed:complete(e) })));
  atomic(resolve(work, 'catalogue.json'), entries.map(e=>({id:e.id,locale:'ar',kind:e.kind,chapterId:e.chapterId,title:e.sourceTitle ?? e.text,date:e.date ?? null,sourceYears:e.sourceYears ?? null,text:e.text,recording:complete(e)?main.entries['ar/'+e.id]:null})));
}
checkpoint('running', initial);
async function worker() {
  while (!stopped && pending.length) {
    const entry = pending.shift(), digest = hash(entry.text), id = 'ar/' + entry.id;
    const parts = entry.chunks.map((_,i)=>`ar/${entry.id}-v4-api-${digest.slice(0,12)}${entry.chunks.length===1?'':`-${i+1}`}.mp3`);
    try {
      for (let i=0; i<parts.length; i++) {
        const path = resolve(root,parts[i]);
        if (existsSync(path) && readFileSync(path).length > 1000) continue;
        if (ledger.requests.some(r=>r.id===id && r.hash===digest && r.chunk===i && r.status!=='saved')) throw Error(`${id} has an unresolved prior attempt; check history before retrying`);
        const balance = await get('user/subscription'), count=chars(entry.chunks[i]);
        // Reserve at full one-credit-per-character cost, including concurrent work.
        // Do not buy credits, enable overages or assume promotional multipliers.
        if (balance.character_limit-balance.character_count < count+activeCharacters) { stopped=true; failure='Included credits cannot fit the next recording'; break; }
        activeCharacters += count;
        const request = { id, hash:digest, chunk:i, characters:count, at:new Date().toISOString(), status:'submitted' };
        ledger.requests.push(request); atomic(ledgerPath,ledger);
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, { method:'POST', headers:{...headers,'Content-Type':'application/json'}, body:JSON.stringify({text:entry.chunks[i],model_id:'eleven_v4',language_code:'ar',voice_settings:settings,apply_text_normalization:'off'}),signal:AbortSignal.timeout(180000) });
        if (!response.ok) { request.status=`HTTP ${response.status}`; throw Error(`Synthesis ${id}: HTTP ${response.status}; no automatic paid retry`); }
        const bytes=Buffer.from(await response.arrayBuffer());
        if (!bytes.length || !response.headers.get('content-type')?.includes('audio')) throw Error(`Invalid audio for ${id}`);
        mkdirSync(dirname(path),{recursive:true});writeFileSync(path+'.tmp',bytes);renameSync(path+'.tmp',path);
        activeCharacters -= count;request.status='saved';request.requestId=response.headers.get('request-id');atomic(ledgerPath,ledger);
      }
      if (parts.every(p=>existsSync(resolve(root,p)))) {
        const recording={provider:'elevenlabs',voice:`elevenlabs:${voiceId}`,model:'eleven_v4',hash:digest,settings,parts,verifiedSourceText:true};
        main.entries[id]=recording;own.entries[id]=recording;atomic(mainPath,main);atomic(ownPath,own);checkpoint();
        console.log(`Saved ${id}; ${entries.filter(complete).length}/${entries.length} complete`);
      }
    } catch(error) { stopped=true;failure=String(error.message);checkpoint('stopped');console.error(failure); }
  }
}
await Promise.all([worker(),worker()]);
const final = await get('user/subscription').catch(()=>null);
checkpoint(stopped?'stopped':'complete',final);
console.log(JSON.stringify(json(resolve(work,'progress.json'))));
if (stopped) process.exitCode=1;
