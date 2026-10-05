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

/** `reached`: Dorar event number from which Islam had reached this place (sourced in the CSV), if any. */
export interface Place { key: string; name: Text; lat: number; lon: number; kind: string; confirmed: boolean; events: number; reached: number | null }

export interface VerseLink {
  type: LinkType;
  event: number | null;
  at: number | null;
  from: number | null;
  to: number | null;
  label: string | null;
  /** English for the label, when the team has written it. */
  labelEn: string | null;
  reason: string | null;
}

export interface Verse {
  id: string;
  title: Text;
  stage: string;
  surah: string;
  /** English surah name(s), e.g. "al-Ankabut / Luqman"; null when not given. */
  surahEn: string | null;
  ref: string;
  ayat: string;
  mushaf: string[];
  bukhari: string[];
  muslim: string[];
  narrator: string | null;
  narratorEn: string | null;
  reason: string;
  /** English of وجه_الارتباط, checked against the Arabic; null means no English yet (show the Arabic with a note). */
  reasonEn: string | null;
  /** The hadith in sunnah.com's own English, quoted word for word, with its page. */
  hadithEn: { text: string; url: string } | null;
  kind: string;
  phrase: Text;
  whole: boolean;
  evidence: Text;
  tafseer: string[];
  link: VerseLink | null;
}

export interface Person {
  id: string; name: Text; kind: string; kindEn: string | null; category: string; bio: string;
  /** English synopsis, checked against the Arabic; null means no English yet. */
  bioEn: string | null;
  /** When they became Muslim (or that they did not), as the sources state; null when not stated. */
  islam: string | null;
  islamEn: string | null;
  death: string | null;
  deathEn: string | null; events: number[]; verses: string[];
  aliases: Text[];
  /** Sourced facts (7_sahaba_references.csv): each with the source's own words and where they come from. */
  facts: PersonFact[];
}

/** `textEn` / `quoteEn`: the fact in English and the source's own English (Dorar's English site), when there is one. */
export interface PersonFact { text: string; textEn: string | null; quote: string; quoteEn: string | null; source: string; url: string | null }

export interface Route { id: string; kind: 'sirah' | 'trade'; name: Text; events: number[]; note: Text; coords: [number, number][] }

export interface MapLabel { id: string; kind: 'region' | 'power' | 'sea'; name: Text; lat: number; lon: number; size: 'l' | 'm' | 's'; rotate: number; note: string; reached: number | null; reachNote: string }

/** A stop on a route walk (route_stops.csv): where the map pauses, with the Dorar line for it. */
export interface RouteStop { name: Text; lat: number; lon: number; event: number; quote: string; url: string }

/** A letter sent from Madinah or a delegation that came to it (map_arcs.csv), drawn on the map at its event.
 * `outcome` is what the source says came of it; `quote` is the source's own words, `quoteEn` its own English if any. */
export interface MapArc {
  id: string; kind: 'letter' | 'delegation'; event: number;
  from: { lat: number; lon: number }; to: { lat: number; lon: number };
  name: Text; outcome: 'accepted' | 'declined' | 'honoured' | 'treaty';
  summary: Text; quote: string; quoteEn: string | null; source: string; url: string; note: Text;
}

/** A chapter question (quiz.csv), answered by choosing a place. */
export interface QuizQuestion { id: string; period: Period; question: Text; answer: string; options: string[]; explanation: Text; event: number; quote: string; url: string }

export interface Sirah {
  events: SirahEvent[];
  byNumber: Map<number, SirahEvent>;
  places: Map<string, Place>;
  verses: Verse[];
  people: Person[];
  routes: Route[];
  labels: MapLabel[];
  stops: Map<string, RouteStop[]>;
  quiz: QuizQuestion[];
  arcs: MapArc[];
}
