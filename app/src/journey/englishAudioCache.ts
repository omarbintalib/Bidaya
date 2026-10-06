export interface AudioPart { path: string; bytes: number; duration: number }
export interface EnglishRecording { hash: string; voice: string; parts: AudioPart[] }
export interface EnglishIndex { version: number; locale: 'en'; entries: Record<string, EnglishRecording> }
export const AUDIO_CACHE_LIMIT = 16 * 1024 * 1024;
const CACHE_NAME = 'bidaya-english-audio-v1';
export function canPrefetch(connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection) {
  return !connection?.saveData && !['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '');
}
const cancelled = () => new DOMException('Download cancelled', 'AbortError');
interface Job { controller: AbortController; background: boolean; promise: Promise<Blob>; listeners: Set<(loaded: number, total: number) => void> }

/** Complete files only; one download at a time, with a persistent three-recording window. */
export class EnglishAudioCache {
  private allowed = new Set<string>();
  private current = new Set<string>();
  private next: AudioPart[] = [];
  private currentParts: AudioPart[] = [];
  private jobs = new Map<string, Job>();
  private queue: Promise<unknown> = Promise.resolve();
  private active: Job | null = null;
  private storage: Promise<Cache | null>;
  private files = new Map<string, AudioPart>();
  private disposed = false;
  private epoch = 0;
  constructor(private index: EnglishIndex, private base: string, storage?: Promise<Cache | null>) {
    for (const recording of Object.values(index.entries)) for (const part of recording.parts) this.files.set(this.url(part.path), part);
    this.storage = storage ?? (async () => { try { return await caches.open(CACHE_NAME); } catch { return null; } })();
  }
  private url(path: string) { return new URL(this.base + path, location.href).href; }
  async setWindow(previous: string | null, current: string | null, next: string | null) {
    this.epoch++;
    this.currentParts = current ? this.index.entries[current]?.parts ?? [] : [];
    this.current = new Set(this.currentParts.map(p => this.url(p.path)));
    this.next = next ? this.index.entries[next]?.parts ?? [] : [];
    this.allowed = new Set([previous, current, next].flatMap(id => id ? (this.index.entries[id]?.parts ?? []).map(p=>this.url(p.path)) : []));
    for (const [url, job] of this.jobs) if (!this.allowed.has(url)) job.controller.abort();
    await this.prune();
  }
  private async prune(incoming = 0, protect?: string) {
    const cache = await this.storage; if (!cache) return;
    try {
      let keys = await cache.keys();
      for (const key of keys) if (!this.allowed.has(key.url)) await cache.delete(key);
      keys = keys.filter(k => this.allowed.has(k.url));
      let size = keys.reduce((n,k)=>n+(this.files.get(k.url)?.bytes ?? AUDIO_CACHE_LIMIT),0);
      // Evict previous before next, never current. Only this audio cache is touched.
      const nextUrls = new Set(this.next.map(p=>this.url(p.path)));
      for (const key of [...keys].sort((a,b)=>Number(nextUrls.has(a.url))-Number(nextUrls.has(b.url)))) {
        if (size+incoming <= AUDIO_CACHE_LIMIT) break;
        if (!this.current.has(key.url) && key.url!==protect) { await cache.delete(key); size-=this.files.get(key.url)?.bytes ?? AUDIO_CACHE_LIMIT; }
      }
      return size+incoming <= AUDIO_CACHE_LIMIT;
    } catch { return false; }
  }
  get(part: AudioPart, background = false, progress?: (loaded: number, total: number) => void): Promise<Blob> {
    const url=this.url(part.path);
    if (this.disposed || !this.allowed.has(url)) return Promise.reject(cancelled());
    const old=this.jobs.get(url);
    if (old && !old.controller.signal.aborted) { if (!background) old.background=false; if(progress)old.listeners.add(progress); return old.promise; }
    if (!background && this.active?.background) this.active.controller.abort();
    const controller=new AbortController();
    const job: Job={controller,background,promise:Promise.resolve(new Blob()),listeners:new Set(progress?[progress]:[])};
    const run=async () => {
      if(controller.signal.aborted || this.disposed || !this.allowed.has(url)) throw cancelled();
      this.active=job;
      const cache=await this.storage;
      try {
        const saved=await cache?.match(url);
        if(saved) { const blob=await saved.blob(); if(blob.size===part.bytes) return blob; await cache?.delete(url); }
      } catch { /* Browser storage can be unavailable; foreground playback still works. */ }
      if(controller.signal.aborted)throw cancelled();
      const response=await fetch(url,{signal:controller.signal,cache:'no-store'});
      if(!response.ok || response.status!==200)throw Error('Could not download recording');
      const reader=response.body?.getReader();const chunks: Uint8Array<ArrayBuffer>[]=[];let loaded=0;
      if(reader) { while(true) { const {done,value}=await reader.read();if(done)break;loaded+=value.length;if(loaded>part.bytes){await reader.cancel();throw Error('Recording size did not match the index');}chunks.push(value as Uint8Array<ArrayBuffer>);job.listeners.forEach(l=>l(loaded,part.bytes)); } }
      else { const bytes=await response.arrayBuffer();chunks.push(new Uint8Array(bytes));loaded=bytes.byteLength; }
      if(controller.signal.aborted || !this.allowed.has(url))throw cancelled();
      if(loaded!==part.bytes)throw Error('Recording download was incomplete');
      const blob=new Blob(chunks,{type:'audio/mpeg'});
      try { if(cache && await this.prune(blob.size,url) && !controller.signal.aborted && this.allowed.has(url)) await cache.put(url,new Response(blob,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(blob.size)}})); } catch { /* Quota/storage failure: play this blob without persistence. */ }
      await this.prune();return blob;
    };
    job.promise=this.queue.catch(()=>{}).then(run).finally(()=>{if(this.jobs.get(url)===job)this.jobs.delete(url);if(this.active===job)this.active=null;});
    this.jobs.set(url,job);this.queue=job.promise.catch(()=>{});return job.promise;
  }
  async prefetch(playedPart: AudioPart) {
    if(!canPrefetch() || !await this.storage)return;
    const epoch=this.epoch;
    // Finish current before next. Awaiting each file avoids a speculative request burst.
    const parts=[...this.currentParts.slice(this.currentParts.findIndex(p=>p.path===playedPart.path)+1),...this.next];
    for(const part of parts) {
      if(epoch!==this.epoch || this.disposed || !canPrefetch())return;
      try { await this.get(part,true); } catch { return; }
    }
  }
  dispose() { this.disposed=true;this.epoch++;for(const job of this.jobs.values())job.controller.abort(); }
}
