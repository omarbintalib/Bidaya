// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NarrationCache, AUDIO_CACHE_LIMIT, canPrefetch, type NarrationIndex } from './narrationCache';
const part=(id:string,bytes=4)=>({path:`en/${id}.mp3`,bytes,duration:1});
const index:NarrationIndex={version:1,locale:'en',entries:Object.fromEntries(['a','b','c','d'].map(id=>[id,{hash:id,voice:'Brian',parts:[part(id)]}]))};
function fakeCache() {
  const values=new Map<string,Response>();
  const key=(r:RequestInfo)=>typeof r==='string'?r:r instanceof Request?r.url:String(r);
  return {values,cache:{match:vi.fn(async(r:RequestInfo)=>values.get(key(r))?.clone()),put:vi.fn(async(r:RequestInfo,v:Response)=>{values.set(key(r),v.clone());}),delete:vi.fn(async(r:RequestInfo)=>values.delete(key(r))),keys:vi.fn(async()=>[...values.keys()].map(url=>new Request(url)))} as unknown as Cache};
}
const response=()=>new Response(new Uint8Array([1,2,3,4]),{headers:{'Content-Type':'audio/mpeg'}});
beforeEach(async()=>{const builtin: string='node:buffer';vi.stubGlobal('Blob',(await import(/* @vite-ignore */ builtin)).Blob);});
afterEach(()=>vi.unstubAllGlobals());
it('does not fetch on window setup; persists complete files and replays without another request',async()=>{
  const {cache,values}=fakeCache();vi.stubGlobal('fetch',vi.fn(async()=>response()));
  const manager=new NarrationCache(index,'/audio/narration/',Promise.resolve(cache));
  await manager.setWindow('a','b','c');expect(fetch).not.toHaveBeenCalled();
  const updates=vi.fn();expect((await manager.get(part('b'),false,updates)).size).toBe(4);expect(updates).toHaveBeenCalledWith(4,4);
  expect((await manager.get(part('b'))).size).toBe(4);expect(fetch).toHaveBeenCalledTimes(1);
  manager.dispose();const reopened=new NarrationCache(index,'/audio/narration/',Promise.resolve(cache));await reopened.setWindow('a','b','c');
  await reopened.get(part('b'));expect(fetch).toHaveBeenCalledTimes(1);expect(values.size).toBe(1);reopened.dispose();
});
it('retains only the previous/current/next recordings as the window advances',async()=>{
  const {cache,values}=fakeCache();vi.stubGlobal('fetch',vi.fn(async()=>response()));const manager=new NarrationCache(index,'/audio/narration/',Promise.resolve(cache));
  await manager.setWindow('a','b','c');for(const id of ['a','b','c'])await manager.get(part(id));
  await manager.setWindow('b','c','d');await manager.get(part('d'));expect([...values.keys()].map(v=>v.split('/').at(-1)).sort()).toEqual(['b.mp3','c.mp3','d.mp3']);manager.dispose();
});
it('shares storage across languages and removes the previous language on switching',async()=>{
  const {cache,values}=fakeCache();vi.stubGlobal('fetch',vi.fn(async()=>response()));
  const english=new NarrationCache(index,'/audio/narration/',Promise.resolve(cache));await english.setWindow(null,'b',null);await english.get(part('b'));english.dispose();
  const arabicPart={...part('b'),path:'ar/b.mp3'};
  const arabic=new NarrationCache({version:1,locale:'ar',entries:{b:{hash:'eid',voice:'Eid',parts:[arabicPart]}}},'/audio/narration/',Promise.resolve(cache));
  await arabic.setWindow(null,'b',null);expect(values.size).toBe(0);await arabic.get(arabicPart);
  expect([...values.keys()]).toEqual([new URL('/audio/narration/ar/b.mp3',location.href).href]);
  vi.mocked(fetch).mockRejectedValue(Error('offline'));expect((await arabic.get(arabicPart)).size).toBe(4);arabic.dispose();
});
it('deduplicates concurrent requests and never downloads more than one file at once',async()=>{
  const {cache}=fakeCache();let active=0,max=0;vi.stubGlobal('fetch',vi.fn(async()=>{active++;max=Math.max(max,active);await Promise.resolve();active--;return response();}));
  const manager=new NarrationCache(index,'/audio/narration/',Promise.resolve(cache));await manager.setWindow('a','b','c');
  await Promise.all([manager.get(part('b')),manager.get(part('b')),manager.get(part('c'))]);expect(fetch).toHaveBeenCalledTimes(2);expect(max).toBe(1);manager.dispose();
});
it('cancels obsolete in-flight and queued downloads on navigation',async()=>{
  const {cache}=fakeCache();let signal:AbortSignal|undefined;
  vi.stubGlobal('fetch',vi.fn((_url,options)=>new Promise((_resolve,reject)=>{signal=options.signal;signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')));})));const manager=new NarrationCache(index,'/audio/narration/',Promise.resolve(cache));await manager.setWindow('a','b','c');
  const pending=manager.get(part('a'));const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});await vi.waitFor(()=>expect(signal).toBeDefined());
  await manager.setWindow('b','c','d');await rejected;expect(signal?.aborted).toBe(true);manager.dispose();
});
it('evicts other recordings to meet the 16 MB ceiling without evicting current',async()=>{
  const {cache,values}=fakeCache();const bigIndex:NarrationIndex={...index,entries:Object.fromEntries(['a','b','c'].map(id=>[id,{hash:id,voice:'Brian',parts:[part(id,9*1024*1024)]}]))};
  for(const id of ['a','b','c'])values.set(new URL(`/audio/narration/en/${id}.mp3`,location.href).href,response());
  const manager=new NarrationCache(bigIndex,'/audio/narration/',Promise.resolve(cache));await manager.setWindow('a','b','c');
  expect(values.has(new URL('/audio/narration/en/b.mp3',location.href).href)).toBe(true);expect(values.size*9*1024*1024).toBeLessThanOrEqual(AUDIO_CACHE_LIMIT);manager.dispose();
});
it('plays without storage, never caches partial downloads, and retries failed downloads',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([1,2]))).mockResolvedValue(response()));
  const manager=new NarrationCache(index,'/audio/narration/',Promise.resolve(null));await manager.setWindow(null,'b','c');
  await expect(manager.get(part('b'))).rejects.toThrow('incomplete');expect((await manager.get(part('b'))).size).toBe(4);
  await manager.prefetch(part('b'));expect(fetch).toHaveBeenCalledTimes(2);manager.dispose();
});
it('storage quota failures do not prevent foreground playback',async()=>{
  const {cache}=fakeCache();vi.mocked(cache.put).mockRejectedValue(new DOMException('full','QuotaExceededError'));vi.stubGlobal('fetch',vi.fn(async()=>response()));
  const manager=new NarrationCache(index,'/audio/narration/',Promise.resolve(cache));await manager.setWindow(null,'b',null);expect((await manager.get(part('b'))).size).toBe(4);manager.dispose();
});
it('disables speculative traffic for Data Saver and slow connections',()=>{
  expect(canPrefetch({saveData:true,effectiveType:'4g'})).toBe(false);for(const type of ['slow-2g','2g','3g'])expect(canPrefetch({effectiveType:type})).toBe(false);
  expect(canPrefetch({effectiveType:'4g'})).toBe(true);expect(canPrefetch({})).toBe(true);
});
it('does not prefetch when Data Saver is enabled and rejects oversized responses',async()=>{
  const {cache}=fakeCache();vi.stubGlobal('navigator',{connection:{saveData:true,effectiveType:'4g'}});vi.stubGlobal('fetch',vi.fn(async()=>response()));
  const manager=new NarrationCache(index,'/audio/narration/',Promise.resolve(cache));await manager.setWindow(null,'b','c');await manager.get(part('b'));await manager.prefetch(part('b'));expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({cache:'no-store'});
  vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array(100)));await expect(manager.get(part('c'))).rejects.toThrow('size');manager.dispose();
});
