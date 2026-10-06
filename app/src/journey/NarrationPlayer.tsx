import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Locale } from '../i18n';
import { digits } from '../data/select';
import { NarrationCache, type NarrationIndex } from './narrationCache';
import './narration.css';
const base = `${import.meta.env.BASE_URL}audio/narration/`;
const indexPromises: Record<string, Promise<NarrationIndex> | undefined> = {};
export function loadNarrationIndex(locale: Locale, collection: 'journey' | 'summary' = 'journey') {
  const key = `${collection}-${locale}`;
  if (!indexPromises[key]) indexPromises[key] = (async () => {
    let cache: Cache | null = null;
    const url = new URL(base + (collection === 'summary' ? 'summary-' : '') + (locale === 'ar' ? 'arabic' : 'english') + '-index.json', location.href).href;
    try { cache = await caches.open('bidaya-narration-index-v1'); } catch { /* Optional storage */ }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-cache' });
      if (!response.ok) throw Error('Index unavailable');
      const index = await response.clone().json() as NarrationIndex;
      if(index.version!==1 || index.locale!==locale || !index.entries)throw Error('Invalid narration index');
      try { await cache?.put(url,response); } catch { /* Index still usable in memory */ }
      return index;
    } catch(error) {
      const saved = await cache?.match(url).catch(()=>undefined);
      if(saved){const index=await saved.json() as NarrationIndex;if(index.version===1&&index.locale===locale&&index.entries)return index;}
      throw error;
    }
  })().catch(error=>{delete indexPromises[key];throw error;});
  return indexPromises[key]!;
}
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2,'0')}`;
const copy = {
  en: { chapter:'Listen to this chapter',event:'Listen to this event',play:'Play narration',pause:'Pause narration',position:'Narration position',speed:'Narration speed',continuous:'Continue listening',loading:'Loading audio',intro:'Chapter introduction',narration:'Event narration',unavailable:'Recording unavailable for this item.',indexError:'Audio information is unavailable. Reload to try again.',ready:'Ready to listen. Press Play.',loadError:'Could not load this recording. Check your connection and press Play to retry.',playError:'Could not play this recording. Press Play to retry.',of:'of' },
  ar: { chapter:'استمع إلى الفصل',event:'استمع إلى الحدث',play:'تشغيل التسجيل',pause:'إيقاف التسجيل مؤقتًا',position:'موضع التسجيل',speed:'سرعة القراءة',continuous:'متابعة الاستماع تلقائيًا',loading:'جارٍ تحميل التسجيل',intro:'مقدمة الفصل',narration:'قراءة الحدث',unavailable:'التسجيل غير متاح لهذا الحدث.',indexError:'تعذر تحميل معلومات التسجيلات. أعد تحميل الصفحة للمحاولة.',ready:'التسجيل جاهز. اضغط تشغيل.',loadError:'تعذر تحميل التسجيل. تحقق من الاتصال واضغط تشغيل للمحاولة.',playError:'تعذر تشغيل التسجيل. اضغط تشغيل للمحاولة.',of:'من' },
};
interface Props { locale?: Locale; collection?: 'journey' | 'summary'; entryId: string | null; previousId: string | null; nextId: string | null; onNext: (()=>void) | null; onStarted: ()=>void; storyPlaying: boolean }

/** One audio element, portalled controls in the active card. No source until Play. */
export default function NarrationPlayer({locale='en',collection='journey',entryId,previousId,nextId,onNext,onStarted,storyPlaying}: Props) {
  const text=copy[locale],formatTime=(seconds:number)=>digits(clock(seconds),locale);
  const [index,setIndex]=useState<NarrationIndex|null>(null);
  const [target,setTarget]=useState<HTMLElement|null>(null);
  const [playing,setPlaying]=useState(false),[loading,setLoading]=useState(false),[progress,setProgress]=useState(0);
  const [error,setError]=useState(''),[time,setTime]=useState(0),[part,setPart]=useState(0);
  const [speed,setSpeed]=useState(1),[continuous,setContinuous]=useState(false);
  const audio=useRef<HTMLAudioElement>(null),manager=useRef<NarrationCache|null>(null);
  const blobUrl=useRef<string|null>(null),generation=useRef(0),loadedPart=useRef(-1),wantedNext=useRef<string|null>(null),wantPlay=useRef(false);
  const latest=useRef({entryId,nextId,onNext,onStarted,continuous,speed});latest.current={entryId,nextId,onNext,onStarted,continuous,speed};
  const recording=entryId?index?.entries[entryId]:undefined;
  const duration=recording?.parts.reduce((n,p)=>n+p.duration,0)??0;
  const release=()=>{audio.current?.pause();audio.current?.removeAttribute('src');audio.current?.load();loadedPart.current=-1;if(blobUrl.current){URL.revokeObjectURL(blobUrl.current);blobUrl.current=null;}};
  useEffect(()=>{
    let live=true;
    void loadNarrationIndex(locale,collection).then(value=>{if(live){manager.current=new NarrationCache(value,base);setIndex(value);}}).catch(()=>{if(live)setError(text.indexError);});
    return()=>{live=false;generation.current++;manager.current?.dispose();manager.current=null;release();};
  },[locale,collection]);
  useLayoutEffect(()=>{
    setTarget(null);
    if(!entryId)return;
    const find=()=>{const node=document.getElementById(`narration-${locale}-${entryId}`);if(node){setTarget(node);return true;}return false;};
    if(find())return;
    const observer=new MutationObserver(()=>{if(find())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect();
  },[entryId,locale]);
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
        try { await player.play(); } catch { if(token===generation.current)setError(text.ready); }
      }
      if(token===generation.current)void cache.prefetch(entry.parts[at]);
    } catch(failure) {
      if(token!==generation.current)return;
      setLoading(false);setPlaying(false);
      if((failure as Error).name!=='AbortError')setError(text.loadError);
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
    // Stop timed progression immediately, including while a slow download is still pending.
    latest.current.onStarted();
    if(blobUrl.current && loadedPart.current===part){latest.current.onStarted();void player.play().catch(()=>setError(text.playError));}
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
  const summaryLabel = locale === 'ar' ? 'استمع إلى هذه اللحظة' : 'Listen to this moment';
  const summaryCaption = locale === 'ar' ? 'قراءة الملخص' : 'Summary narration';
  const ui=entryId && target ? <section className="narration-player" lang={locale} dir={locale==='ar'?'rtl':'ltr'} aria-label={collection==='summary'?summaryLabel:entryId.startsWith('chapter-')?text.chapter:text.event} onClick={e=>e.stopPropagation()}>
    <div className="narration-player-bar">
      <button type="button" className="narration-player-play" onClick={toggle} disabled={!recording||loading} aria-label={playing?text.pause:text.play}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{playing?<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>:<path d="m8 5 11 7-11 7z"/>}</svg>
      </button>
      <input className="narration-player-seek" type="range" min="0" max={duration||1} step="0.1" value={Math.min(time,duration||1)} onChange={e=>seek(Number(e.target.value))} disabled={!recording||loading} aria-label={text.position} aria-valuetext={`${formatTime(time)} ${text.of} ${formatTime(duration)}`} />
      <span className="narration-player-time" dir="ltr">{formatTime(time)} / {formatTime(duration)}</span>
      <select aria-label={text.speed} value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.75,1,1.25,1.5].map(rate=><option key={rate} value={rate}>{digits(String(rate),locale)}×</option>)}</select>
    </div>
    <div className="narration-player-options"><label><input type="checkbox" checked={continuous} onChange={e=>setContinuous(e.target.checked)} />{text.continuous}</label>
      {loading && <span role="status">{text.loading}{progress?` · ${digits(String(progress),locale)}%`:'…'}</span>}
      {!loading && recording && <span className="narration-player-caption">{collection==='summary'?summaryCaption:entryId.startsWith('chapter-')?text.intro:text.narration}</span>}
    </div>
    {error && <p role="alert">{error}</p>}{index&&!recording&&<p>{text.unavailable}</p>}
  </section>:null;
  return <><audio ref={audio} preload="none" aria-hidden="true" onPlay={()=>{setPlaying(true);setError('');}} onPause={()=>setPlaying(false)} onTimeUpdate={()=>{const before=recording?.parts.slice(0,part).reduce((n,p)=>n+p.duration,0)??0;setTime(before+(audio.current?.currentTime??0));}} onError={()=>{if(blobUrl.current)setError(text.playError);}} onEnded={()=>{
    if(recording && part+1<recording.parts.length)void playPart(part+1);
    else if(latest.current.continuous && latest.current.onNext && latest.current.nextId){wantedNext.current=latest.current.nextId;latest.current.onNext();}
    else {setPlaying(false);wantPlay.current=false;}
  }}/>{ui&&target?createPortal(ui,target):null}</>;
}
