// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import NarrationPlayer from './NarrationPlayer';
const index={version:1,locale:'en',entries:{'event-1':{hash:'1',voice:'Brian',parts:[{path:'en/1.mp3',bytes:4,duration:10},{path:'en/1b.mp3',bytes:4,duration:10}]},'event-2':{hash:'2',voice:'Brian',parts:[{path:'en/2.mp3',bytes:4,duration:10}]}}};
let host:HTMLDivElement,slot:HTMLDivElement,root:Root;
beforeEach(()=>{
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('caches',{open:vi.fn().mockRejectedValue(Error('storage unavailable'))});
  vi.stubGlobal('fetch',vi.fn(async(url)=>String(url).endsWith('english-index.json')?new Response(JSON.stringify(index)):String(url).endsWith('arabic-index.json')?new Response(JSON.stringify({...index,locale:'ar',entries:Object.fromEntries(Object.entries(index.entries).map(([id,entry])=>[id,{...entry,voice:'Eid',parts:entry.parts.map(part=>({...part,path:part.path.replace('en/','ar/')}))}]))})):new Response(new Uint8Array([1,2,3,4]))));
  vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(function(this:HTMLMediaElement){this.dispatchEvent(new Event('pause'));});
  vi.spyOn(HTMLMediaElement.prototype,'play').mockImplementation(async function(this:HTMLMediaElement){this.dispatchEvent(new Event('play'));});
  vi.stubGlobal('URL',class extends URL {static createObjectURL=vi.fn(()=> 'blob:local-audio');static revokeObjectURL=vi.fn();});
  host=document.createElement('div');slot=document.createElement('div');slot.id='narration-en-event-1';document.body.append(host,slot);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();slot.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const render=async(id:string|null='event-1',next:(()=>void)|null=null,storyPlaying=false,locale:'en'|'ar'='en')=>{await act(async()=>root.render(<NarrationPlayer key={locale} locale={locale} entryId={id} previousId={null} nextId={next?'event-2':null} onNext={next} onStarted={()=>{}} storyPlaying={storyPlaying}/>));};
const play=async()=>{await act(async()=>slot.querySelector<HTMLButtonElement>('button')!.click());};
it('loads the separate summary index and no audio until Play, in each language',async()=>{
  for(const locale of ['en','ar'] as const){
    const path=`${locale}/summary-1.mp3`,id='summary-event-1';
    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockImplementation(async url=>String(url).endsWith('-index.json')?new Response(JSON.stringify({version:1,locale,entries:{[id]:{hash:'summary',voice:locale==='en'?'Jon':'Eid',parts:[{path,bytes:4,duration:30}]}}})):new Response(new Uint8Array([1,2,3,4])));
    slot.id=`narration-${locale}-${id}`;
    await act(async()=>root.render(<NarrationPlayer key={locale} locale={locale} collection="summary" entryId={id} previousId={null} nextId={null} onNext={null} onStarted={()=>{}} storyPlaying={false}/>));
    expect(vi.mocked(fetch).mock.calls.map(([url])=>String(url))).toEqual([expect.stringContaining(`summary-${locale==='en'?'english':'arabic'}-index.json`)]);
    expect(slot.textContent).toContain(locale==='en'?'Summary narration':'قراءة الملخص');
    await play();expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).endsWith(path))).toBe(true);
  }
});
it('renders Arabic controls and fetches only Arabic audio after manual Play',async()=>{
  slot.id='narration-ar-event-1';await render('event-1',null,false,'ar');
  expect(slot.querySelector('section')?.dir).toBe('rtl');expect(slot.textContent).toContain('٠:٠٠ / ٠:٢٠');
  expect(slot.querySelector('button')?.getAttribute('aria-label')).toBe('تشغيل التسجيل');
  expect(vi.mocked(fetch).mock.calls.every(([url])=>String(url).endsWith('arabic-index.json'))).toBe(true);
  await play();expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('/ar/1.mp3'))).toBe(true);
});
it('language changes release the playing recording and require manual Play',async()=>{
  await render();await play();vi.mocked(HTMLMediaElement.prototype.play).mockClear();
  slot.id='narration-ar-event-1';await render('event-1',null,false,'ar');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-audio');expect(host.querySelector('audio')?.getAttribute('src')).toBeNull();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();expect(slot.querySelector('button')?.getAttribute('aria-label')).toBe('تشغيل التسجيل');
});
it('renders a full card bar without loading any audio before Play',async()=>{
  await render();expect(slot.querySelector('input[type=range]')).not.toBeNull();expect(slot.textContent).toContain('0:00 / 0:20');
  expect(host.querySelector('audio')?.getAttribute('src')).toBeNull();expect(vi.mocked(fetch).mock.calls.every(([url])=>String(url).endsWith('english-index.json'))).toBe(true);
  await play();await vi.waitFor(()=>expect(host.querySelector('audio')?.src).toBe('blob:local-audio'));expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
});
it('scrolling and touch controls do not pause narration',async()=>{
  await render();await play();vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
  window.dispatchEvent(new Event('wheel'));window.dispatchEvent(new Event('touchstart'));expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
});
it('continues through parts and advances only with the opt-in toggle',async()=>{
  const next=vi.fn();await render('event-1',next);await play();
  await act(async()=>host.querySelector('audio')!.dispatchEvent(new Event('ended')));expect(next).not.toHaveBeenCalled();
  await act(async()=>slot.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
  await act(async()=>host.querySelector('audio')!.dispatchEvent(new Event('ended')));expect(next).toHaveBeenCalledOnce();
});
it('manual navigation releases the blob, resets controls and starts paused',async()=>{
  await render();await play();vi.mocked(HTMLMediaElement.prototype.play).mockClear();slot.id='narration-en-event-2';await render('event-2');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-audio');expect(host.querySelector('audio')?.getAttribute('src')).toBeNull();expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(slot.textContent).toContain('0:00 / 0:10');
});
it('quiz steps hide the controls and story playback pauses narration',async()=>{
  await render();await play();vi.mocked(HTMLMediaElement.prototype.pause).mockClear();await render('event-1',null,true);expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  await render(null);expect(slot.querySelector('.narration-player')).toBeNull();
});
it('failed downloads show a retry message and do not use a streaming URL',async()=>{
  await render();vi.mocked(fetch).mockRejectedValueOnce(Error('offline'));await play();expect(slot.querySelector('[role=alert]')?.textContent).toContain('Check your connection');expect(host.querySelector('audio')?.getAttribute('src')).toBeNull();
});
it('applies playback speed and resumes the explicitly requested continuous next event',async()=>{
  const next=vi.fn();await render('event-1',next);await play();
  await act(async()=>{const select=slot.querySelector('select')!;select.value='1.5';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(host.querySelector('audio')!.playbackRate).toBe(1.5);
  await act(async()=>slot.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
  await act(async()=>host.querySelector('audio')!.dispatchEvent(new Event('ended')));
  await act(async()=>host.querySelector('audio')!.dispatchEvent(new Event('ended')));expect(next).toHaveBeenCalledOnce();
  vi.mocked(HTMLMediaElement.prototype.play).mockClear();slot.id='narration-en-event-2';await render('event-2');
  await vi.waitFor(()=>expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce());expect(host.querySelector('audio')!.playbackRate).toBe(1.5);
});

const changeSpeed = async (value = '1.5') => {
  await act(async () => { const select = slot.querySelector('select')!; select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); });
};
it('persists speed through manual event changes, remounts, languages and summary playback', async () => {
  await render(); await changeSpeed(); await play();
  expect(localStorage.getItem('bidaya.narration.speed')).toBe('1.5');
  await act(async () => host.querySelector('audio')!.dispatchEvent(new Event('ended')));
  expect(host.querySelector('audio')!.playbackRate).toBe(1.5);
  slot.id = 'narration-en-event-2'; await render('event-2'); await play();
  expect(slot.querySelector('select')!.value).toBe('1.5'); expect(host.querySelector('audio')!.playbackRate).toBe(1.5);
  await act(async () => root.unmount()); root = createRoot(host);
  slot.id = 'narration-ar-event-1'; await render('event-1', null, false, 'ar'); await play();
  expect(slot.querySelector('select')!.value).toBe('1.5'); expect(host.querySelector('audio')!.playbackRate).toBe(1.5);
  slot.id = 'narration-en-event-1';
  await act(async () => root.render(<NarrationPlayer key="summary" collection="summary" locale="en" entryId="event-1" previousId={null} nextId={null} onNext={null} onStarted={() => {}} storyPlaying={false} />));
  await play(); expect(slot.querySelector('select')!.value).toBe('1.5'); expect(host.querySelector('audio')!.playbackRate).toBe(1.5);
});
it.each(['1.5', 'invalid', '2', '', 'NaN'])('validates the saved speed %s on a fresh player', async value => {
  localStorage.setItem('bidaya.narration.speed', value); await render(); await play();
  expect(slot.querySelector('select')!.value).toBe(value === '1.5' ? '1.5' : '1');
  expect(host.querySelector('audio')!.playbackRate).toBe(value === '1.5' ? 1.5 : 1);
});
it('keeps speed across remounts when writing preferences is unavailable', async () => {
  const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('storage blocked'); });
  await render(); await changeSpeed(); await play();
  expect(host.querySelector('audio')!.playbackRate).toBe(1.5);
  slot.id = 'narration-ar-event-1'; await render('event-1', null, false, 'ar');
  expect(slot.querySelector('select')!.value).toBe('1.5');
  save.mockRestore(); await changeSpeed('1');
});
it('defaults safely when reading preferences is unavailable and pauses for a tour', async () => {
  await render();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('storage blocked'); });
  slot.id = 'narration-ar-event-1'; await render('event-1', null, false, 'ar');
  expect(slot.querySelector('select')!.value).toBe('1'); await play();
  vi.mocked(HTMLMediaElement.prototype.pause).mockClear(); vi.mocked(HTMLMediaElement.prototype.play).mockClear();
  await act(async () => window.dispatchEvent(new Event('journey-tour-starting')));
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce(); expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
