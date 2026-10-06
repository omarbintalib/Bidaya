import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,copyFileSync,statSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {parseCsv} from '../../src/data/csv.ts';
import {narrationEntries,normalizeText,chunkText} from './lib/narration.mjs';
const app=resolve(import.meta.dirname,'../..'),root=resolve(app,'public/audio/narration'),work=resolve(app,'tmp/narration/elevenlabs/jon-v4');
mkdirSync(work,{recursive:true});
const voiceId='MFZUKuGQUsGJPQjTS4wC',model='eleven_v4',settings={stability:0.5,similarity_boost:0.75,style:0.2,use_speaker_boost:true,speed:1};
const json=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const atomic=(p,v)=>{mkdirSync(dirname(p),{recursive:true});writeFileSync(p+'.tmp',JSON.stringify(v,null,2));for(let i=0;;i++){try{renameSync(p+'.tmp',p);return;}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||i>=9)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50*(i+1));}}};
const hash=text=>createHash('sha256').update(JSON.stringify({text,model,voiceId,settings})).digest('hex');
const exclusions=[],audit=json(resolve(app,'scripts/audio/audits/english.json'));
const entries=narrationEntries(parseCsv(readFileSync(resolve(app,'../data/2_sirah_events.csv'),'utf8')),parseCsv(readFileSync(resolve(app,'../data/12_dorar_titles_and_texts_ar_en.csv'),'utf8')),exclusions).filter(e=>e.locale==='en');
if(entries.length!==146||entries.filter(e=>e.kind==='event').length!==142)throw Error('Unexpected corpus count');
for(const e of entries){const fields=e.kind==='event'?['sourceTitle','sourceBody','date']:['text'];if(audit[e.id]!==createHash('sha256').update(JSON.stringify(fields.map(f=>e[f]))).digest('hex'))throw Error('Source mismatch '+e.id);e.text=normalizeText(e.text,'en');e.chunks=chunkText(e.text,9000);e.hash=hash(e.text);e.parts=e.chunks.map((_,i)=>`en/${e.id}-jon-v4-${e.hash.slice(0,12)}${e.chunks.length===1?'':'-'+(i+1)}.mp3`);}
const manifestPath=resolve(work,'manifest.json'),manifest=existsSync(manifestPath)?json(manifestPath):{version:1,voiceId,model,entries:{}};
const complete=e=>{const r=manifest.entries['en/'+e.id];return r?.hash===e.hash&&r.voice===`elevenlabs:${voiceId}`&&r.parts.length===e.parts.length&&r.parts.every((p,i)=>p===e.parts[i]&&existsSync(resolve(root,p))&&statSync(resolve(root,p)).size>1000);};
const recording=e=>({provider:'elevenlabs',voice:`elevenlabs:${voiceId}`,model,hash:e.hash,settings,parts:e.parts,verifiedSourceText:true});
// Reuse the exact two approved auditions; no paid request for those samples.
const auditionPath=resolve(app,'tmp/voice-comparison-ledger.json');
if(existsSync(auditionPath))for(const e of entries){const sample=json(auditionPath).requests.find(r=>r.voiceId===voiceId&&r.entryId===e.id&&r.status==='saved'&&r.text===e.text);if(sample&&e.chunks.length===1&&!complete(e)){const from=resolve(app,'public/audio/auditions/english-voices',sample.filename);if(existsSync(from)){mkdirSync(resolve(root,'en'),{recursive:true});copyFileSync(from,resolve(root,e.parts[0]));manifest.entries['en/'+e.id]=recording(e);}}}
atomic(manifestPath,manifest);atomic(resolve(work,'transcripts.json'),entries);atomic(resolve(work,'quran-exclusions.json'),exclusions);
let pending=entries.filter(e=>!complete(e)),stopped=false,failure=null,activeCharacters=0;
const summary=()=>({total:146,completed:entries.filter(complete).length,eventsCompleted:entries.filter(e=>e.kind==='event'&&complete(e)).length,chaptersCompleted:entries.filter(e=>e.kind==='chapter'&&complete(e)).length,pendingEntries:entries.filter(e=>!complete(e)).length,pendingCharacters:entries.filter(e=>!complete(e)).reduce((n,e)=>n+Array.from(e.text).length,0)});
console.log(JSON.stringify(summary()));
if(!process.argv.includes('--generate'))process.exit(0);
for(const line of readFileSync(resolve(app,'.env'),'utf8').split(/\r?\n/)){const m=line.match(/^\s*(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');}
const key=process.env.ELEVENLABS_API_KEY;if(!key)throw Error('Missing ElevenLabs API key');const headers={'xi-api-key':key};
async function balance(){const r=await fetch('https://api.elevenlabs.io/v1/user/subscription',{headers,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Credit check HTTP '+r.status);return r.json();}
const initial=await balance();if(initial.tier==='free')throw Error('Upgraded account required');
const lockPath=resolve(app,'tmp/narration/generation.lock');let lock;try{lock=openSync(lockPath,'wx');}catch{throw Error('Another narration batch is running');}writeFileSync(lock,String(process.pid));
process.on('exit',()=>{closeSync(lock);try{unlinkSync(lockPath);}catch{}});process.on('SIGINT',()=>process.exit(130));process.on('SIGTERM',()=>process.exit(143));
const ledgerPath=resolve(work,`usage-${initial.next_character_count_reset_unix}.json`),ledger=existsSync(ledgerPath)?json(ledgerPath):{accountUsedBefore:initial.character_count,requests:[]};
function checkpoint(status='running',account=null){atomic(manifestPath,manifest);atomic(ledgerPath,ledger);atomic(resolve(work,'progress.json'),{status,at:new Date().toISOString(),voiceName:'Jon',voiceId,model,...summary(),remainingIncludedCredits:account?account.character_limit-account.character_count:null,completed:entries.filter(complete).map(e=>e.id),pending:entries.filter(e=>!complete(e)).map(e=>e.id),failure});}
checkpoint('running',initial);
async function worker(){while(!stopped&&pending.length){const e=pending.shift();try{for(let i=0;i<e.chunks.length;i++){const file=resolve(root,e.parts[i]);if(existsSync(file)&&statSync(file).size>1000)continue;if(ledger.requests.some(r=>r.id===e.id&&r.hash===e.hash&&r.chunk===i&&r.status!=='saved'))throw Error(e.id+' has an unresolved prior request; review provider history before retrying');const account=await balance(),count=Array.from(e.chunks[i]).length;
 // Never enable overages or depend on a promotional credit multiplier.
 if(account.character_limit-account.character_count<count+activeCharacters){stopped=true;failure='Included credits cannot fit the next recording';break;}activeCharacters+=count;
 const request={id:e.id,hash:e.hash,chunk:i,characters:count,status:'submitted',at:new Date().toISOString()};ledger.requests.push(request);atomic(ledgerPath,ledger);
 const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({text:e.chunks[i],model_id:model,language_code:'en',voice_settings:settings,apply_text_normalization:'auto'}),signal:AbortSignal.timeout(180000)});
 if(!response.ok){request.status='HTTP '+response.status;atomic(ledgerPath,ledger);throw Error(`Synthesis ${e.id}: HTTP ${response.status}; no automatic paid retry`);}const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<1000||!response.headers.get('content-type')?.includes('audio'))throw Error('Invalid audio '+e.id);mkdirSync(dirname(file),{recursive:true});writeFileSync(file+'.tmp',bytes);renameSync(file+'.tmp',file);activeCharacters-=count;request.status='saved';request.requestId=response.headers.get('request-id');request.characterCost=response.headers.get('character-cost');atomic(ledgerPath,ledger);
 }if(e.parts.every(p=>existsSync(resolve(root,p)))){manifest.entries['en/'+e.id]=recording(e);checkpoint();console.log(`Saved ${e.id}; ${summary().completed}/146 complete`);}
 }catch(error){stopped=true;failure=error.message;checkpoint('stopped');console.error(failure);}}}
await Promise.all([worker(),worker(),worker()]);const final=await balance().catch(()=>null);checkpoint(stopped?'stopped':'complete',final);console.log(JSON.stringify(json(resolve(work,'progress.json'))));if(stopped)process.exitCode=1;
