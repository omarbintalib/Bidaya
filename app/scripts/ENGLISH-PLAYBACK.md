# English narration playback

The Journey's active English chapter/event card exposes a minimal player below its title and date. There is one audio element for the whole Journey. Arabic uses its existing player and manifest; this implementation does not write Arabic recordings or the shared narration manifest.

Run `npm run tts:english-index` after English recordings or source data change. It validates all 142 events and four chapter introductions against committed source checksums in `scripts/audio/audits/english.json`, checks every file, calculates MP3 frame durations and writes only `public/audio/narration/english-index.json`. Generation credentials and temporary files are not needed. The checked-in static index is used in normal builds; builds do not synthesize or regenerate it.

The English-only index is about 38 KB. Audio is never embedded in JavaScript or requested on page load. Play fetches one complete MP3 part at a time, then uses a local blob URL; multipart seeking resolves the relevant part. Complete files are stored in the browser's `bidaya-english-audio-v1` Cache API cache. A separate small index cache allows replay metadata to work if the Journey is already available and its index request fails.

The rolling audio cache retains previous/current/next recordings, capped at 16 MiB. As the active step changes, obsolete downloads are aborted and recordings outside the window are removed. Current audio is protected during storage eviction. Only the active part has a blob URL, revoked on replacement, navigation or unmount. Interrupted/partial responses are never persisted. Storage/private-mode/quota failures fall back to playing the downloaded part without persistent storage.

Audio fetches bypass the browser's separate HTTP cache (`cache: 'no-store'`), so removing a file from the managed rolling cache does not leave an additional unbounded local audio collection. Server/CDN cache headers still apply to hosted hashed assets. The 16 MiB ceiling covers audio managed by this player; the small index and existing site assets are separate.

After Play, background downloads finish the current recording before preparing the next one, serially. No speculative loading occurs with Data Saver or reported 2G/3G connections, or when persistent audio storage is unavailable. The browser's cache can be evicted by the device; offline playback covers currently cached audio, not a fully offline website.

Continuous playback is opt-in and stops at quizzes/end. Scrolling within a card keeps listening; manually changing the active card or language pauses it. Starting the existing timed story mode pauses narration and vice versa.

The English hashed MP3 route gets one-year immutable HTTP caching in Vercel; the index revalidates. The current static English collection is about 116 MB on disk, but only requested recordings are transferred. No TTS API is called by playback. The source branch was synchronized to e08e14c before this implementation; the earlier local source snapshot remains in Git stash as a recovery point.
