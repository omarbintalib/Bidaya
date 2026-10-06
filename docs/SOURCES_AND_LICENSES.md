# Sources, tools and licences

## Content sources (what Bidaya says comes only from these)

| Source | Used for | Where |
|---|---|---|
| Dorar's historical encyclopedia (الموسوعة التاريخية – الدرر السنية), Arabic and English | The 142 Sirah events: titles, dates, places, texts; the summary's quotations | `data/2_sirah_events.csv`, `data/11_…`, `data/12_…`, assistant index |
| Sahih al-Bukhari and Sahih Muslim (links to sunnah.com; Muslim in Fuad Abd al-Baqi's numbering) | The ASB verse records, people's facts; 1,579 Bukhari hadiths in the assistant | `data/1_related_surahs.csv`, `data/7_sahaba_references.csv`, `data/8_hadith_verification.csv` |
| Dorar's Tafsir Encyclopedia (موسوعة التفسير – الدرر السنية) | The TAF verse records, with the evidence and grading it quotes | `data/1_related_surahs.csv`, `data/9_dorar_tafseer_review.csv` |
| al-Raheeq al-Makhtum (Shamela book 9820) | Supporting narrative in the assistant (602 passages; weak reports removed) | assistant index |
| al-Wahidi, Asbab al-Nuzul, ed. Isam al-Humaydan (Shamela book 11314) | Occasions of revelation in the assistant: only narrations the editor grades sahih/hasan with a connected chain | assistant index |
| Quranpedia (Sahih International) | English for each Quran quotation inside the English reasons, word for word | `data/quran_en.csv` |

Nothing was added from memory or from other sources; every record carries its link. Rules for what is indexed and
what was removed are in `backend/README.md` → *Content rules*.

## AI models and services

| Component | Role | Licence / terms |
|---|---|---|
| BAAI/bge-m3 | Embeddings for search (Arabic and English) | MIT |
| BAAI/bge-reranker-v2-m3 | Reranking the retrieved passages | Apache-2.0 |
| OpenAI API, model `gpt-6-luna` | Routing the question and writing the cited answer | OpenAI terms of use (API key kept as a hosting secret, never in the repository) |
| Text-to-speech: Azure Speech (English) and ElevenLabs (Arabic) | Narration of the 142 events and the chapter introductions, recorded in advance (`app/scripts/audio/README.md`) | the services' terms |
| Modal | Hosts the backend on a serverless GPU | service terms |
| Vercel | Hosts the website | service terms |

## Software

| Package | Licence |
|---|---|
| React, React DOM, Vite, @vitejs/plugin-react | MIT |
| TypeScript | Apache-2.0 |
| topojson-client, world-atlas (Natural Earth data, public domain) | ISC |
| Fontsource packages (IBM Plex Sans, IBM Plex Sans Arabic, Noto Naskh Arabic) | SIL OFL 1.1 (fonts) |
| @vercel/speed-insights | see its package |
| FastAPI | MIT |
| sentence-transformers, transformers | Apache-2.0 |
| PyTorch | BSD-3-Clause |
| Vitest, jsdom | MIT |

## Assets

| Asset | Source and terms |
|---|---|
| Saudi font (Regular, Bold) | Ministry of Culture, KSA; unchanged, embedded notices in `app/public/fonts/NOTICES.md` |
| Honorific font (ﷺ and the Companion honorifics) | SIL OFL, licence files in `app/public/fonts/` |
| Background sounds | Freesound recordings released as CC0, each credited in `app/public/sounds/CREDITS.md`; the adhan was provided by the team |
| Map coastlines and land | Natural Earth via world-atlas (public domain) |
| Brand files | The team's, in `docs/brand/` |

## Tools used to build the project

The code was written by the team with the help of AI coding assistants (Claude Code). The Sirah content was gathered
and reviewed by the team's content reviewer against the sources above.

## Licence of this project

No project-wide software licence has been chosen yet. Third-party assets and packages keep their own licences and
notices.
