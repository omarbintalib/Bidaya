import type { Sirah, SirahEvent } from '../data/types';

/** A tiny in-memory data set so UI tests don't depend on fetch. */
const event = (n: number, order: number, year: number, lat: number, lon: number): SirahEvent => ({
  n, order, period: year < 0 ? 'makkah' : 'madinah', year, month: null, ce: 610 + order, place: `p${n}`, placeName: { ar: 'مكة', en: 'Makkah' },
  lat, lon, precision: 'exact', inferred: false, title: { ar: `حدث ${n}`, en: `Event ${n}` }, text: { ar: 'نص', en: 'Text' }, url: `https://dorar.net/history/event/${n}`, urlEn: null,
});
const events = [event(12, 12, -13, 21.42, 39.83), event(59, 59, 2, 23.78, 38.79)];

export const sirahFixture: Sirah = { events, byNumber: new Map(events.map(e => [e.n, e])), places: new Map(), verses: [], people: [], routes: [], labels: [], stops: new Map(), quiz: [], arcs: [], growth: new Map(), sounds: new Map() };
