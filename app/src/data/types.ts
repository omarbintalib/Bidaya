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
export interface Place {
  key: string; name: Text; lat: number; lon: number; kind: string; confirmed: boolean; events: number; reached: number | null;
  /** The name used before `renamedAt` (a Dorar event), e.g. Yathrib before the Hijrah; null when the name never changed. */
  nameBefore: Text | null; renamedAt: number | null;
  /** Why the earlier name is shown, with its sources; shown when the earlier name is pointed at. */
  nameNote: Text | null;
  /** The source's words for when Islam reached the place (شاهد_بلوغ_الإسلام). */
  reachQuote: string | null;
}

/** A count of Muslims at a place, as a Dorar event gives it (islam_growth.csv): a lower bound, with what it counts. */
export interface Growth { event: number; count: number; what: Text; quote: string; url: string }

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
  /** English for each Quran quotation in reasonEn (quran_en.csv): a published translation of the whole ayah(s),
   * quoted word for word from Quranpedia, never our own wording. */
  quranEn: QuranEn[];
}

/** `part`: the quotation is part of the ayah, and `text` is the matching words of the translation (`ayah` is all of it). */
export interface QuranEn { quote: string; ref: string; text: string; ayah: string; part: boolean; translator: string; url: string }

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

export interface MapLabel { id: string; kind: 'region' | 'power' | 'sea'; name: Text; lat: number; lon: number; size: 'l' | 'm' | 's'; rotate: number; note: Text; reached: number | null; reachNote: Text }

/** A stop on a route walk (route_stops.csv): where the map pauses, with the Dorar line for it. */
export interface RouteStop { name: Text; lat: number; lon: number; event: number; quote: string; url: string }

/** A letter sent from Madinah or a delegation that came to it (map_arcs.csv), drawn on the map at its event.
 * `outcome` is what the source says came of it; `quote` is the source's own words, `quoteEn` its own English if any. */
export interface MapArc {
  id: string; kind: 'letter' | 'delegation'; event: number;
  from: { lat: number; lon: number }; to: { lat: number; lon: number };
  name: Text; outcome: 'accepted' | 'declined' | 'honoured' | 'treaty';
  summary: Text; quote: string; quoteEn: string | null; source: string; url: string; note: Text;
  /** Short name shown at the far end on the map: the king a letter went to, or where a delegation came from. */
  end: Text;
}

/** A chapter question (quiz.csv), answered by choosing a place. */
export interface QuizQuestion { id: string; period: Period; question: Text; answer: string; options: string[]; explanation: Text; event: number; quote: string; url: string }

/** An event's background sound (event_sounds.csv), with the source's words that justify it. */
export type SoundKind = 'battle' | 'march' | 'caravan' | 'walk' | 'sea' | 'march+sea' | 'wind';
/**
 * `horses`: the source's words when the text mentions horses (only then are horses heard; most expeditions rode camels).
 * `note`: what the sound rests on beyond the quote, e.g. a crossing the text does not mention but the route requires.
 */
export interface EventSound { kind: SoundKind; quote: string; horses: string | null; note: Text | null }

/** A recording the reader can play on an event's card (event_audio.csv), e.g. the adhan on the event of its legislation. */
export interface EventAudio { file: string; label: Text; description: Text }

/** One moment of the Sirah summary (summary_film.csv): a Dorar event and the sentences of its own text that tell it. */
export interface SummaryMoment { n: number; overview: boolean; quotes: Record<Locale, string[]> }

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
  /** Background sound per Dorar event number; events not listed get the quiet desert wind only. */
  sounds: Map<number, EventSound>;
  /** Recordings to play on an event's card, by Dorar event number. */
  audio: Map<number, EventAudio>;
  /** The Sirah summary played on the map, in order. */
  summary: SummaryMoment[];
  growth: Map<string, Growth[]>;
}
