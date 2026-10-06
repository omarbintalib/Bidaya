import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EnglishAudioCache, type EnglishIndex } from './englishAudioCache';
import './englishNarration.css';
const base = `${import.meta.env.BASE_URL}audio/narration/`;
let indexPromise: Promise<EnglishIndex> | null = null;
export function loadEnglishIndex() {
  if (!indexPromise) indexPromise = (async () => {
    let cache: Cache | null = null;
    const url = new URL(base + 'english-index.json', location.href).href;
    try { cache = await caches.open('bidaya-english-index-v1'); } catch { /* Optional storage */ }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-cache' });
      if (!response.ok) throw Error('Index unavailable');
      const index = await response.clone().json() as EnglishIndex;
      if(index.version!==1 || index.locale!=='en' || !index.entries)throw Error('Invalid English index');
      try { await cache?.put(url,response); } catch { /* Index still usable in memory */ }
      return index;
    } catch(error) {
      const saved = await cache?.match(url).catch(()=>undefined);
      if(saved)return saved.json() as Promise<EnglishIndex>;
      throw error;
    }
  })().catch(error=>{indexPromise=null;throw error;});
  return indexPromise;
}
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,'0')}`;
interface Props { entryId: string | null; previousId: string | null; nextId: string | null; onNext: (()=>void) | null; onStarted: ()=>void; storyPlaying: boolean }

/** One audio element, portalled controls in the active English card. No source until Play. */
export default function EnglishNarration({entryId,previousId,nextId,onNext,onStarted,storyPlaying}: Props) {
  const [index,setIndex]=useState<EnglishIndex|null>(null);
  const [target,setTarget]=useState<HTMLElement|null>(null);
  const [playing,setPlaying]=useState(false),[loading,setLoading]=useState(false),[progress,setProgress]=useState(0);
  const [error,setError]=useState(''),[time,setTime]=useState(0),[part,setPart]=useState(0);
  const [speed,setSpeed]=useState(1),[continuous,setContinuous]=useState(false);
  const audio=useRef<HTMLAudioElement>(null),manager=useRef<EnglishAudioCache|null>(null);
  const blobUrl=useRef<string|null>(null),generation=useRef(0),loadedPart=useRef(-1),wantedNext=useRef<string|null>(null),wantPlay=useRef(false);
  const latest=useRef({entryId,nextId,onNext,onStarted,continuous,speed});latest.current={entryId,nextId,onNext,onStarted,continuous,speed};
  const recording=entryId?index?.entries[entryId]:undefined;
  const duration=recording?.parts.reduce((n,p)=>n+p.duration,0)??0;
  const release=()=>{audio.current?.pause();audio.current?.removeAttribute('src');audio.current?.load();loadedPart.current=-1;if(blobUrl.current){URL.revokeObjectURL(blobUrl.current);blobUrl.current=null;}};
  useEffect(()=>{
    let live=true;
    void loadEnglishIndex().then(value=>{if(live){manager.current=new EnglishAudioCache(value,base);setIndex(value);}}).catch(()=>{if(live)setError('Audio information is unavailable. Reload to try again.');});
    return()=>{live=false;generation.current++;manager.current?.dispose();manager.current=null;release();};
  },[]);
  useLayoutEffect(()=>{
    setTarget(null);
    if(!entryId)return;
    const find=()=>{const node=document.getElementById(`english-audio-${entryId}`);if(node){setTarget(node);return true;}return false;};
    if(find())return;
    const observer=new MutationObserver(()=>{if(find())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect();
  },[entryId]);
  async function playPart(at: number, offset=0, shouldPlay=true) {
    const current=latest.current.entryId,entry=current?index?.entries[current]:undefined,cache=manager.current,player=audio.current;
    if(!entry?.parts[at] || !cache || !player)return;
    const token=++generation.current;wantPlay.current=shouldPlay;
    setLoading(true);setProgress(0);setError('');
    try {
      const blob=await cache.get(entry.parts[at],false,(n,total)=>{if(token===generation.current)setProgress(Math.min(100,Math.round(n/total*100)));});
      if(token!==generation.current || current!==latest.current.entryId)return;
      release();blobUrl.current=URL.createObjectURL(blob);loadedPart.current=at;setPart(at);
      player.src=blobUrl.current;player.playbackRate=latest.current.speed;
      player.addEventListener('loadedmetadata',()=>{if(token===generation.current)player.currentTime=Math.min(offset,player.duration||offset);},{once:true});
      player.load();setLoading(false);
      if(wantPlay.current) {
        latest.current.onStarted();
        try { await player.play(); } catch { if(token===generation.current)setError('Ready to listen. Press Play.'); }
      }
      if(token===generation.current)void cache.prefetch(entry.parts[at]);
    } catch(failure) {
      if(token!==generation.current)return;
      setLoading(false);setPlaying(false);
      if((failure as Error).name!=='AbortError')setError('Could not load this recording. Check your connection and press Play to retry.');
    }
  }
  useEffect(()=>{
    generation.current++;wantPlay.current=false;release();setPart(0);setTime(0);setLoading(false);setPlaying(false);setError('');
    const token=generation.current;
    const resume=wantedNext.current===entryId && entryId!==null;wantedNext.current=null;
    void manager.current?.setWindow(previousId,entryId,nextId).then(()=>{if(resume && token===generation.current && latest.current.entryId===entryId)void playPart(0);});
  },[entryId,index]);
  // Adjacent steps can change independently of the active ID after upstream data updates.
  useEffect(()=>{void manager.current?.setWindow(previousId,entryId,nextId);},[previousId,nextId]);
  useEffect(()=>{if(audio.current)audio.current.playbackRate=speed;},[speed]);
  useEffect(()=>{if(storyPlaying){wantPlay.current=false;wantedNext.current=null;audio.current?.pause();}},[storyPlaying]);
  useEffect(()=>{
    const pause=()=>{wantPlay.current=false;wantedNext.current=null;audio.current?.pause();};
    const hide=()=>{if(document.hidden)pause();};
    const otherAudio=(event:Event)=>{if(event.target instanceof HTMLMediaElement && event.target!==audio.current)pause();};
    window.addEventListener('journey-language-changing',pause);document.addEventListener('visibilitychange',hide);document.addEventListener('play',otherAudio,true);
    return()=>{window.removeEventListener('journey-language-changing',pause);document.removeEventListener('visibilitychange',hide);document.removeEventListener('play',otherAudio,true);};
  },[]);
  function toggle() {
    const player=audio.current;if(!player || loading)return;
    if(!player.paused){wantPlay.current=false;player.pause();return;}
    wantPlay.current=true;
    if(blobUrl.current && loadedPart.current===part){latest.current.onStarted();void player.play().catch(()=>setError('Could not play. Press Play to retry.'));}
    else void playPart(part);
  }
  function seek(value:number) {
    if(!recording)return;
    let start=0,at=0;
    for(;at<recording.parts.length-1 && value>=start+recording.parts[at].duration;at++)start+=recording.parts[at].duration;
    setTime(value);
    if(at===loadedPart.current && audio.current)audio.current.currentTime=value-start;
    else void playPart(at,value-start,playing);
  }
  const ui=entryId && target ? <section className="english-narration" aria-label={entryId.startsWith('chapter-')?'Listen to this chapter':'Listen to this event'} onClick={e=>e.stopPropagation()}>
    <div className="english-narration-bar">
      <button type="button" className="english-narration-play" onClick={toggle} disabled={!recording||loading} aria-label={playing?'Pause narration':'Play narration'}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{playing?<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>:<path d="m8 5 11 7-11 7z"/>}</svg>
      </button>
      <input className="english-narration-seek" type="range" min="0" max={duration||1} step="0.1" value={Math.min(time,duration||1)} onChange={e=>seek(Number(e.target.value))} disabled={!recording||loading} aria-label="Narration position" aria-valuetext={`${clock(time)} of ${clock(duration)}`} />
      <span className="english-narration-time">{clock(time)} / {clock(duration)}</span>
      <select aria-label="Narration speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.75,1,1.25,1.5].map(rate=><option key={rate} value={rate}>{rate}×</option>)}</select>
    </div>
    <div className="english-narration-options"><label><input type="checkbox" checked={continuous} onChange={e=>setContinuous(e.target.checked)} />Continue listening</label>
      {loading && <span role="status">Loading audio{progress?` · ${progress}%`:'…'}</span>}
      {!loading && recording && <span className="english-narration-caption">{entryId.startsWith('chapter-')?'Chapter introduction':'Event narration'}</span>}
    </div>
    {error && <p role="alert">{error}</p>}{index&&!recording&&<p>Recording unavailable for this item.</p>}
  </section>:null;
  return <><audio ref={audio} preload="none" aria-hidden="true" onPlay={()=>{setPlaying(true);setError('');}} onPause={()=>setPlaying(false)} onTimeUpdate={()=>{const before=recording?.parts.slice(0,part).reduce((n,p)=>n+p.duration,0)??0;setTime(before+(audio.current?.currentTime??0));}} onError={()=>{if(blobUrl.current)setError('Could not play this recording. Press Play to retry.');}} onEnded={()=>{
    if(recording && part+1<recording.parts.length)void playPart(part+1);
    else if(latest.current.continuous && latest.current.onNext && latest.current.nextId){wantedNext.current=latest.current.nextId;latest.current.onNext();}
    else {setPlaying(false);wantPlay.current=false;}
  }}/>{ui&&target?createPortal(ui,target):null}</>;
}
