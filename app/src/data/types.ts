import type { Locale } from '../i18n';

export type Text = Record<Locale, string>;
export type Period = 'prologue' | 'makkah' | 'hijrah' | 'madinah';
export type Precision = 'exact' | 'approx' | 'region' | 'none';
export type LinkType = 'direct' | 'context' | 'suggested' | 'after' | 'stage' | 'placeholder';

export interface SirahEvent {
  n: number;            // Dorar event number — the stable ID, never row position
  order: number;        // ترتيب_العرض: timeline order
  period: Period;
  year: number | null;  // Hijri year; negative = before the Hijrah
  month: string | null;
  ce: number | null;
  place: string | null;
  placeName: Text;
  lat: number | null;
  lon: number | null;
  precision: Precision;
  inferred: boolean;
  title: Text;
  text: Text;
  url: string;
  urlEn: string | null;
}

export interface Place { key: string; name: Text; lat: number; lon: number; kind: string; confirmed: boolean }

export interface VerseLink {
  type: LinkType;
  event: number | null;
  at: number | null;
  from: number | null;
  to: number | null;
  label: string | null;
  reason: string | null;
}

export interface Verse {
  id: string;
  title: Text;
  stage: string;
  surah: string;
  ref: string;
  ayat: string;
  mushaf: string[];
  bukhari: string[];
  muslim: string[];
  narrator: string | null;
  reason: string;
  kind: string;
  phrase: Text;
  whole: boolean;
  evidence: Text;
  tafseer: string[];
  link: VerseLink | null;
}

export interface Person { id: string; name: Text; female: boolean; bio: string; death: string | null; events: number[]; verses: string[] }

export interface Route { id: string; kind: 'sirah' | 'trade'; name: Text; events: number[]; note: Text; coords: [number, number][] }

export interface MapLabel { id: string; kind: 'region' | 'power' | 'sea'; name: Text; lat: number; lon: number; size: 'l' | 'm' | 's'; rotate: number; note: string }

export interface Sirah {
  events: SirahEvent[];
  byNumber: Map<number, SirahEvent>;
  places: Map<string, Place>;
  verses: Verse[];
  people: Person[];
  routes: Route[];
  labels: MapLabel[];
}
