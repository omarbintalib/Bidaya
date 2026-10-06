import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseCsv } from '../../src/data/csv.ts';
import { narrationEntries, toSsml, chunkText, VOICES, NORMALIZER_VERSION, normalizeText, reserveCharacters } from './lib/narration.mjs';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const flag = name => process.argv.includes(`--${name}`);
const value = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const envPath = resolve(app, '.env');
if (existsSync(envPath)) for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
const hash = input => createHash('sha256').update(input).digest('hex');
const atomicJson = (path, object) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + '.tmp', JSON.stringify(object, null, 2));
  // Windows readers (Vite or antivirus) can briefly prevent replacing an open file.
  for (let attempt = 0; ; attempt++) {
    try { renameSync(path + '.tmp', path); return; }
    catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 9) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
    }
  }
};
const output = resolve(app, 'public/audio/narration');
const work = resolve(app, 'tmp/narration');
mkdirSync(work, { recursive: true });
const overridesPath = resolve(app, 'scripts/audio/narration-pronunciations.json');
const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, 'utf8')) : { ar: {}, en: {} };
const removed = [];
const entries = narrationEntries(parseCsv(readFileSync(resolve(app, '../data/2_sirah_events.csv'), 'utf8')), parseCsv(readFileSync(resolve(app, '../data/12_dorar_titles_and_texts_ar_en.csv'), 'utf8')), removed);
// Auditions are complete, separate source entries, never invented date drills or truncated excerpts.
const samples = entries.filter(e => e.id === 'chapter-makkah' || e.id === 'event-12');
const selected = flag('audition') ? samples : entries;
if(value('locale','en')!=='en')throw Error('Azure generates English only. Arabic uses the Eid v4 generator.');
const jobs = selected.filter(entry=>entry.locale==='en').map(entry => ({ ...entry, chunks: chunkText(normalizeText(entry.text, entry.locale)).map(text => toSsml(text, entry.locale, overrides[entry.locale])) }));
const chars = ssml => Array.from(ssml.replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|apos);/g, 'x')).length;
const estimated = jobs.reduce((total, job) => total + job.chunks.reduce((sum, s) => sum + chars(s), 0), 0);
atomicJson(resolve(work, 'quran-exclusions.json'), removed);
atomicJson(resolve(work, 'transcripts.json'), jobs.map(({ id, locale, kind, sourceTitle, sourceBody, sourceYears, body, date, text, chunks }) => ({ id, locale, kind, sourceTitle, sourceBody, sourceYears, body, date, text, chunks })));
console.log(JSON.stringify({ mode: flag('audition') ? 'audition' : 'all', entries: jobs.length, chunks: jobs.reduce((n, e) => n + e.chunks.length, 0), characters: estimated, excludedQuranPassages: removed.length, voices: VOICES }));
if (!flag('generate')) process.exit(0);
const region = process.env.AZURE_SPEECH_REGION, key = process.env.AZURE_SPEECH_KEY;
if (!region || !/^[a-z0-9]+$/.test(region) || !key) throw new Error('Set AZURE_SPEECH_REGION and AZURE_SPEECH_KEY in app/.env.');
const budget = Number(value('budget', process.env.AZURE_TTS_CHARACTER_BUDGET || '500000'));
if (!Number.isSafeInteger(budget) || budget < 1 || budget > 500000) throw new Error('F0 budget must be between 1 and 500000 characters.');
const month = new Date().toISOString().slice(0, 7);
const lockPath = resolve(work, 'generation.lock');
let lock;
try { lock = openSync(lockPath, 'wx'); } catch { throw new Error('Another generator is running (tmp/narration/generation.lock). If a previous run crashed, verify it has stopped before removing the lock.'); }
writeFileSync(lock, String(process.pid));
process.on('exit', () => { closeSync(lock); try { unlinkSync(lockPath); } catch { /* already cleaned */ } });
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));
const ledgerPath = resolve(work, `usage-${month}.json`);
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : { month, reservedCharacters: 0, requests: [] };
const manifestPath = resolve(output, flag('audition') ? 'auditions.json' : 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { version: 1, voices: VOICES, entries: {} };
manifest.voices = {...manifest.voices,en:VOICES.en};
// A pronunciation change for new events must not spend the allowance redoing completed audio.
const keepCompleted = flag('keep-completed');
const completeRecording = (id, locale) => {
  const recording = manifest.entries[id];
  return recording?.voice === VOICES[locale] && recording.parts?.length > 0 && recording.parts.every(file => {
    const path = resolve(output, file);
    return existsSync(path) && readFileSync(path).length > 0;
  });
};
// Remove obsolete references before regeneration so the player cannot mix old and revised text.
for (const job of jobs) {
  const id = `${job.locale}/${job.id}`;
  if (keepCompleted && completeRecording(id, job.locale)) continue;
  const digest = hash(JSON.stringify({ chunks: job.chunks, version: NORMALIZER_VERSION, format: 'audio-24khz-48kbitrate-mono-mp3' }));
  if (manifest.entries[id]?.hash !== digest) delete manifest.entries[id];
}
atomicJson(manifestPath, manifest);
// Validate voices before making billable synthesis requests.
const list = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { headers: { 'Ocp-Apim-Subscription-Key': key }, signal: AbortSignal.timeout(30000) });
if (!list.ok) throw new Error(`Azure voice validation failed: HTTP ${list.status}. Check the resource key and region.`);
const available = await list.json();
if (!available.some(v => v.ShortName === VOICES.en)) throw new Error(`Selected voice unavailable: ${VOICES.en}`);
mkdirSync(output, { recursive: true });
let generated = 0, reused = 0;
const pending = [];
for (const job of jobs) {
  const id = `${job.locale}/${job.id}`;
  if (keepCompleted && completeRecording(id, job.locale)) continue;
  const digest = hash(JSON.stringify({ chunks: job.chunks, version: NORMALIZER_VERSION, format: 'audio-24khz-48kbitrate-mono-mp3' }));
  const previous = manifest.entries[id];
  const missingCharacters = job.chunks.reduce((sum, ssml, i) => {
    const path = resolve(output, `${job.locale}/${job.id}-${digest.slice(0, 12)}-${i + 1}.mp3`);
    return sum + (existsSync(path) && readFileSync(path).length > 0 ? 0 : chars(ssml));
  }, 0);
  if (ledger.reservedCharacters + missingCharacters > budget) {
    pending.push({ id, characters: missingCharacters });
    continue;
  }
  const parts = [];
  for (const [i, ssml] of job.chunks.entries()) {
    const file = `${job.locale}/${job.id}-${digest.slice(0, 12)}-${i + 1}.mp3`;
    const path = resolve(output, file);
    if (existsSync(path) && readFileSync(path).length > 0) { parts.push(file); reused++; continue; }
    const count = chars(ssml);
    let success = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      // Reserve before sending. Failed or interrupted requests may have been billed; never silently refund them.
      reserveCharacters(ledger, count, budget);
      ledger.requests.push({ at: new Date().toISOString(), id, chunk: i + 1, count, attempt: attempt + 1, status: 'reserved' });
      atomicJson(ledgerPath, ledger);
      let response;
      try {
        response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'BidayaNarration' }, body: ssml, signal: AbortSignal.timeout(90000) });
      } catch { ledger.requests.at(-1).status = 'network-error'; atomicJson(ledgerPath, ledger); }
      if (response?.ok) {
        let bytes;
        try { bytes = Buffer.from(await response.arrayBuffer()); }
        catch {
          ledger.requests.at(-1).status = 'audio-transfer-error'; atomicJson(ledgerPath, ledger);
          if (attempt < 2) await new Promise(r => setTimeout(r, 2200 * 2 ** attempt));
          continue;
        }
        if (!bytes.length || !response.headers.get('content-type')?.includes('audio')) throw new Error('Azure returned an invalid audio response.');
        mkdirSync(dirname(path), { recursive: true }); writeFileSync(path + '.tmp', bytes); renameSync(path + '.tmp', path);
        ledger.requests.at(-1).status = 'saved'; atomicJson(ledgerPath, ledger);
        parts.push(file); generated++; success = true; break;
      }
      if (response) { ledger.requests.at(-1).status = `HTTP ${response.status}`; atomicJson(ledgerPath, ledger); }
      if (response && ![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`Azure synthesis failed: HTTP ${response.status}. Stopped without displaying credentials.`);
      if (attempt < 2) await new Promise(r => setTimeout(r, Math.max(2200 * 2 ** attempt, Math.min(30000, Number(response?.headers.get('retry-after') || 0) * 1000))));
    }
    if (!success) throw new Error(`Synthesis failed after retries for ${id}. Rerun to resume.`);
    await new Promise(r => setTimeout(r, 2200)); // Below F0's request rate limit.
  }
  if (previous?.hash === digest && previous.voice === VOICES[job.locale] && JSON.stringify(previous.parts) === JSON.stringify(parts)) continue;
  manifest.entries[id] = { hash: digest, voice: VOICES[job.locale], parts, ...(previous?.duration ? { duration: previous.duration } : {}) };
  atomicJson(manifestPath, manifest);
  console.log(`Saved ${id} (${parts.length} part(s)); reserved ${ledger.reservedCharacters}/${budget} characters.`);
}
atomicJson(resolve(work, 'pending.json'), { month, reservedCharacters: ledger.reservedCharacters, budget, entries: pending });
console.log(JSON.stringify({ generated, reused, pendingEntries: pending.length, reservedCharacters: ledger.reservedCharacters, manifest: flag('audition') ? 'auditions.json' : 'manifest.json' }));
