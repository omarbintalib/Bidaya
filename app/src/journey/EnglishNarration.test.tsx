// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import EnglishNarration from './EnglishNarration';
const index={version:1,locale:'en',entries:{'event-1':{hash:'1',voice:'Brian',parts:[{path:'en/1.mp3',bytes:4,duration:10},{path:'en/1b.mp3',bytes:4,duration:10}]},'event-2':{hash:'2',voice:'Brian',parts:[{path:'en/2.mp3',bytes:4,duration:10}]}}};
let host:HTMLDivElement,slot:HTMLDivElement,root:Root;
beforeEach(()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('caches',{open:vi.fn().mockRejectedValue(Error('storage unavailable'))});
  vi.stubGlobal('fetch',vi.fn(async(url)=>String(url).endsWith('english-index.json')?new Response(JSON.stringify(index)):new Response(new Uint8Array([1,2,3,4]))));
  vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(function(this:HTMLMediaElement){this.dispatchEvent(new Event('pause'));});
  vi.spyOn(HTMLMediaElement.prototype,'play').mockImplementation(async function(this:HTMLMediaElement){this.dispatchEvent(new Event('play'));});
  vi.stubGlobal('URL',class extends URL {static createObjectURL=vi.fn(()=> 'blob:local-audio');static revokeObjectURL=vi.fn();});
  host=document.createElement('div');slot=document.createElement('div');slot.id='english-audio-event-1';document.body.append(host,slot);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();slot.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const render=async(id:string|null='event-1',next:(()=>void)|null=null,storyPlaying=false)=>{await act(async()=>root.render(<EnglishNarration entryId={id} previousId={null} nextId={next?'event-2':null} onNext={next} onStarted={()=>{}} storyPlaying={storyPlaying}/>));};
const play=async()=>{await act(async()=>slot.querySelector<HTMLButtonElement>('button')!.click());};
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
  await render();await play();vi.mocked(HTMLMediaElement.prototype.play).mockClear();slot.id='english-audio-event-2';await render('event-2');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-audio');expect(host.querySelector('audio')?.getAttribute('src')).toBeNull();expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(slot.textContent).toContain('0:00 / 0:10');
});
it('quiz steps hide the controls and story playback pauses narration',async()=>{
  await render();await play();vi.mocked(HTMLMediaElement.prototype.pause).mockClear();await render('event-1',null,true);expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  await render(null);expect(slot.querySelector('.english-narration')).toBeNull();
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
  vi.mocked(HTMLMediaElement.prototype.play).mockClear();slot.id='english-audio-event-2';await render('event-2');
  await vi.waitFor(()=>expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce());expect(host.querySelector('audio')!.playbackRate).toBe(1.5);
});
