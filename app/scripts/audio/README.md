# Journey narration

Recordings live in `public/audio/narration/en/` and `public/audio/narration/ar/`.
Each language has 142 event recordings and four separate chapter introductions.
English uses ElevenLabs Jon (`MFZUKuGQUsGJPQjTS4wC`, `eleven_v4`); Arabic uses Eid Clear Arabic Narrator (`Ywuz3KyW2N5pqKNpwcCL`, `eleven_v4`). The website's English index is replaced only after the complete Jon batch passes source validation. Brian's previous recordings and metadata are preserved in the ignored local checkpoint archive.

`manifest.json` maps stable `en/event-N`, `ar/event-N` and language/chapter IDs to hashed MP3 filenames and generation metadata. Preserve these IDs when integrating recordings. Multipart English recordings play as one item.

The website reads only `english-index.json` or `arabic-index.json`, containing paths, byte sizes and durations. Rebuild and validate them without credentials or TTS requests:

```sh
npm run tts:english-index
npm run tts:arabic-index
npm run tts:test
npm test
npm run build
```

The builder checks all IDs against the source CSV files in the repository's `data/` directory and source checksums in `audits/`. ElevenLabs recordings also check the exact normalized text, voice and settings against each recording hash. It never rewrites the shared manifest. `--manifest` and `--output` allow validation of a candidate batch before installation.

## Playback and storage

No MP3 downloads occur before manual Play. The shared player downloads complete parts, plays blob URLs and keeps previous/current/next recordings in a persistent Cache API bucket with a combined 16 MiB ceiling across both languages. Navigation cancels obsolete downloads; language changes stop playback. Optional continuous listening stops at quizzes and the final item. Preloading is serial and disabled on Data Saver or reported slow connections. Storage failures fall back to foreground playback. Cached recordings work offline while the Journey itself remains available.

## Generation and resuming

`npm run tts:plan:english` and `npm run tts:plan:arabic` inspect generation work without calling TTS. Explicit `tts:generate:english` / `tts:generate:arabic` commands make paid provider requests, skip matching completed recordings and retain checkpoint ledgers under ignored `tmp/narration/`. Do not delete those ledgers when resuming. Both generators coordinate through a local generation lock.

Jon's transcripts, source hashes, independent manifest and billing checkpoints live in `tmp/narration/elevenlabs/jon-v4/`. The generator reuses matching approved Jon auditions. It checks included credits before each request, records returned character costs, and stops on failures without automatically retrying paid requests. Voice settings match the approved audition: stability 0.5, similarity 0.75, style 0.2 and speed 1.

After generation, `npm run tts:install:english` validates all 146 recordings and replaces only the English metadata. `node scripts/audio/install-jon.mjs --archive-old` also moves obsolete English MP3s to the ignored checkpoint directory, preserving a local recovery copy. The old Azure generator is retained as a reference; the current English commands use Jon.

Credentials belong in ignored `app/.env`; never commit it. Azure uses `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`; Eid uses `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`. Keep credentials and local auditions outside `public/`.

Chapter names and date ranges are separate from event recordings. Event scripts use the source title, one introductory date and source event prose; Quran passages, resources and people metadata are excluded. Arabic normalization expands dates and numbers for pronunciation and removes spoken symbols. Source wording is not generated or embellished. Generator transcripts, exclusions, billing ledgers and old audition experiments remain local under ignored `tmp/`.
