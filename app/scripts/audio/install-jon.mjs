import {readFileSync,writeFileSync,existsSync,mkdirSync,copyFileSync,renameSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
const app=resolve(import.meta.dirname,'../..'),root=resolve(app,'public/audio/narration'),work=resolve(app,'tmp/narration/elevenlabs/jon-v4');
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const currentPath=resolve(root,'manifest.json'),current=json(currentPath),jon=json(resolve(work,'manifest.json'));
const candidate={...current,voices:{...current.voices,en:'elevenlabs:MFZUKuGQUsGJPQjTS4wC'},entries:{...current.entries}};
for(const key of Object.keys(current.entries).filter(k=>k.startsWith('en/'))){const entry=jon.entries[key];if(!entry||entry.provider!=='elevenlabs'||entry.voice!=='elevenlabs:MFZUKuGQUsGJPQjTS4wC'||entry.model!=='eleven_v4')throw Error('Jon batch incomplete: '+key);candidate.entries[key]=entry;}
if(Object.keys(jon.entries).length!==146)throw Error('Jon batch must have all 146 entries');
const candidatePath=resolve(work,'install-manifest.json'),indexPath=resolve(work,'install-index.json');writeFileSync(candidatePath,JSON.stringify(candidate,null,2));
execFileSync(process.execPath,[resolve(app,'scripts/audio/build-index.mjs'),'--locale','en','--manifest',candidatePath,'--output',indexPath],{cwd:app,stdio:'inherit'});
// All source hashes, MP3 files and durations pass before changing website metadata.
if(!existsSync(resolve(work,'previous-manifest.json')))copyFileSync(currentPath,resolve(work,'previous-manifest.json'));
if(!existsSync(resolve(work,'previous-index.json')))copyFileSync(resolve(root,'english-index.json'),resolve(work,'previous-index.json'));
copyFileSync(candidatePath,currentPath);copyFileSync(indexPath,resolve(root,'english-index.json'));
if(process.argv.includes('--archive-old')){
 const previous=json(resolve(work,'previous-manifest.json')),keep=new Set(Object.values(candidate.entries).flatMap(e=>e.parts));
 for(const part of Object.entries(previous.entries).filter(([k])=>k.startsWith('en/')).flatMap(([,e])=>e.parts)){
  if(keep.has(part))continue;
  const from=resolve(root,part),to=resolve(work,'previous-audio',part);
  if(!from.startsWith(resolve(root,'en')+sep)||!to.startsWith(resolve(work,'previous-audio')+sep))throw Error('Unexpected archival path');
  if(existsSync(from)){mkdirSync(dirname(to),{recursive:true});renameSync(from,to);}
 }
}
console.log('Jon English narration installed; Arabic entries preserved. Previous metadata and optional audio archive remain in local checkpoints.');
