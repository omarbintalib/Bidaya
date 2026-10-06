# Journey narration

Recordings live in `public/audio/narration/en/` and `public/audio/narration/ar/`.
Each language has 142 event recordings and four separate chapter introductions.
English uses Azure Brian Dragon HD Latest; Arabic uses ElevenLabs Eid Clear Arabic Narrator (`Ywuz3KyW2N5pqKNpwcCL`, `eleven_v4`).

`manifest.json` maps stable `en/event-N`, `ar/event-N` and language/chapter IDs to hashed MP3 filenames and generation metadata. Preserve these IDs when integrating recordings. Multipart English recordings play as one item.

The website reads only `english-index.json` or `arabic-index.json`, containing paths, byte sizes and durations. Rebuild and validate them without credentials or TTS requests:

```sh
npm run tts:english-index
npm run tts:arabic-index
npm run tts:test
npm test
npm run build
```

The builder checks all IDs against the source CSV files in the repository's `data/` directory and source checksums in `audits/`. Arabic also checks the exact normalized text, voice and settings against each recording hash. It never rewrites the shared manifest.

## Playback and storage

No MP3 downloads occur before manual Play. The shared player downloads complete parts, plays blob URLs and keeps previous/current/next recordings in a persistent Cache API bucket with a combined 16 MiB ceiling across both languages. Navigation cancels obsolete downloads; language changes stop playback. Optional continuous listening stops at quizzes and the final item. Preloading is serial and disabled on Data Saver or reported slow connections. Storage failures fall back to foreground playback. Cached recordings work offline while the Journey itself remains available.

## Generation and resuming

`npm run tts:plan:english` and `npm run tts:plan:arabic` inspect generation work without calling TTS. Explicit `tts:generate:english` / `tts:generate:arabic` commands make paid provider requests, skip matching completed recordings and retain checkpoint ledgers under ignored `tmp/narration/`. Do not delete those ledgers when resuming. Both generators coordinate through a local generation lock.

Credentials belong in ignored `app/.env`; never commit it. Azure uses `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`; Eid uses `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`. Keep credentials and local auditions outside `public/`.

Chapter names and date ranges are separate from event recordings. Event scripts use the source title, one introductory date and source event prose; Quran passages, resources and people metadata are excluded. Arabic normalization expands dates and numbers for pronunciation and removes spoken symbols. Source wording is not generated or embellished. Generator transcripts, exclusions, billing ledgers and old audition experiments remain local under ignored `tmp/`.
