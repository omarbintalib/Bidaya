import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseCsv } from '../../src/data/csv.ts';
import { summaryEntries, SUMMARY_VOICES, SUMMARY_MODEL, SUMMARY_SETTINGS, digest } from './lib/summary.mjs';
import { duration } from './lib/mp3.mjs';

const app = resolve(import.meta.dirname, '../..'), root = resolve(app, 'public/audio/narration');
const work = resolve(app, 'tmp/narration/elevenlabs/summary-v4');
mkdirSync(work, { recursive: true });
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const atomic = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path + '.tmp', JSON.stringify(value, null, 2)); renameSync(path + '.tmp', path); };
const csv = name => parseCsv(readFileSync(resolve(app, '../data', name), 'utf8'));
const exclusions = [];
const entries = summaryEntries(csv('summary_film.csv'), csv('2_sirah_events.csv'), csv('12_dorar_titles_and_texts_ar_en.csv'), exclusions);
const manifestPath = resolve(root, 'summary-manifest.json');
const manifest = existsSync(manifestPath) ? json(manifestPath) : { version: 1, entries: {} };
const complete = e => {
  const saved = manifest.entries[e.locale + '/' + e.id], file = resolve(root, e.path);
  return saved?.hash === e.hash && saved.sourceHash === e.sourceHash && saved.model === SUMMARY_MODEL && digest(saved.settings) === digest(SUMMARY_SETTINGS) && saved.voice === `elevenlabs:${SUMMARY_VOICES[e.locale]}` && saved.parts.length === 1 && saved.parts[0] === e.path && existsSync(file) && statSync(file).size > 1000;
};
atomic(resolve(work, 'transcripts.json'), entries);
atomic(resolve(work, 'quran-exclusions.json'), exclusions);
const progress = () => Object.fromEntries(['en', 'ar'].map(locale => [locale, { total: 21, completed: entries.filter(e => e.locale === locale && complete(e)).length, pendingCharacters: entries.filter(e => e.locale === locale && !complete(e)).reduce((n, e) => n + Array.from(e.text).length, 0) }]));
console.log(JSON.stringify(progress()));

function buildIndices() {
  for (const locale of ['en', 'ar']) {
    const index = {};
    for (const e of entries.filter(e => e.locale === locale)) {
      if (!complete(e)) throw Error('Missing or stale summary audio: ' + locale + '/' + e.id);
      const bytes = readFileSync(resolve(root, e.path));
      index[e.id] = { hash: e.hash, voice: `elevenlabs:${SUMMARY_VOICES[locale]}`, parts: [{ path: e.path, bytes: bytes.length, duration: duration(bytes) }] };
    }
    atomic(resolve(root, `summary-${locale === 'en' ? 'english' : 'arabic'}-index.json`), { version: 1, locale, entries: index });
  }
  // Reviewable source transcript; no credentials or provider request metadata.
  atomic(resolve(app, 'scripts/audio/audits/summary.json'), entries);
}
if (process.argv.includes('--index')) { buildIndices(); process.exit(0); }
if (!process.argv.includes('--generate')) process.exit(0);
for (const line of readFileSync(resolve(app, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw Error('Missing ElevenLabs API key');
const headers = { 'xi-api-key': key };
async function balance() {
  const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('Credit check HTTP ' + response.status);
  return response.json();
}
const initial = await balance();
const lockPath = resolve(app, 'tmp/narration/generation.lock');
const lock = openSync(lockPath, 'wx'); writeFileSync(lock, String(process.pid));
process.on('exit', () => { closeSync(lock); try { unlinkSync(lockPath); } catch {} });
process.on('SIGINT', () => process.exit(130)); process.on('SIGTERM', () => process.exit(143));
const ledgerPath = resolve(work, `usage-${initial.next_character_count_reset_unix}.json`);
const ledger = existsSync(ledgerPath) ? json(ledgerPath) : { accountUsedBefore: initial.character_count, requests: [] };
let stopped = false, failure = null, activeCharacters = 0;
const pending = entries.filter(e => !complete(e));
function checkpoint(status, account = null) {
  atomic(manifestPath, manifest); atomic(ledgerPath, ledger);
  atomic(resolve(work, 'progress.json'), { status, at: new Date().toISOString(), ...progress(), failure, remainingIncludedCredits: account ? account.character_limit - account.character_count : null });
}
checkpoint('running', initial);
async function worker() {
  while (!stopped && pending.length) {
    const e = pending.shift();
    try {
      if (e.text.length > 9000) throw Error('Summary needs multipart support: ' + e.id);
      if (ledger.requests.some(r => r.id === e.id && r.locale === e.locale && r.hash === e.hash && r.status !== 'saved')) throw Error('Unresolved previous request; review provider history before retrying');
      const account = await balance(), characters = Array.from(e.text).length;
      if (stopped) return;
      if (account.character_limit - account.character_count < characters + activeCharacters) throw Error('Included credit budget reached');
      activeCharacters += characters;
      const request = { id: e.id, locale: e.locale, hash: e.hash, characters, status: 'submitted', at: new Date().toISOString() };
      ledger.requests.push(request); atomic(ledgerPath, ledger);
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${SUMMARY_VOICES[e.locale]}?output_format=mp3_44100_128`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
        body: JSON.stringify({ text: e.text, model_id: SUMMARY_MODEL, language_code: e.locale, voice_settings: SUMMARY_SETTINGS, apply_text_normalization: e.locale === 'ar' ? 'off' : 'auto' }),
      });
      if (!response.ok) { request.status = 'HTTP ' + response.status; atomic(ledgerPath, ledger); throw Error(`Synthesis ${e.locale}/${e.id}: HTTP ${response.status}; no automatic paid retry`); }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 1000 || !response.headers.get('content-type')?.includes('audio')) throw Error('Invalid audio');
      duration(bytes);
      const file = resolve(root, e.path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file + '.tmp', bytes); renameSync(file + '.tmp', file);
      activeCharacters -= characters; request.status = 'saved'; request.requestId = response.headers.get('request-id'); request.characterCost = response.headers.get('character-cost');
      manifest.entries[e.locale + '/' + e.id] = { provider: 'elevenlabs', model: SUMMARY_MODEL, voice: `elevenlabs:${SUMMARY_VOICES[e.locale]}`, settings: SUMMARY_SETTINGS, hash: e.hash, sourceHash: e.sourceHash, parts: [e.path], event: e.event, order: e.order };
      checkpoint(stopped ? 'stopped' : 'running'); console.log(`Saved ${e.locale}/${e.id}`);
    } catch (error) { stopped = true; failure = error.message; checkpoint('stopped'); console.error(failure); }
  }
}
await Promise.all([worker(), worker()]);
if (!stopped) buildIndices();
checkpoint(stopped ? 'stopped' : 'complete', await balance().catch(() => null));
console.log(JSON.stringify(json(resolve(work, 'progress.json'))));
if (stopped) process.exitCode = 1;
