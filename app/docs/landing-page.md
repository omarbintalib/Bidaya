# Landing page

The home route keeps the original hero and destination menu. Five sections below it explain the Sirah experience, show how the story and map connect, introduce deeper exploration, explain the sources, and link to `/journey` through the shared route transition.

## Content and appearance

- `src/landing/copy.ts` contains matching Arabic and English descriptions and image alternatives. Arabic is the app default. Keep descriptions limited to existing Journey functionality.
- `src/landing/LandingTour.tsx` owns the introduction and its two real Journey links. Modifier clicks retain native browser behavior. The discovery link scrolls and focuses the introduction without adding a history entry.
- `src/landing/landing.css` uses the existing paper, ink, brass, fonts, contrast, and reading-size tokens. Mobile stacks the alternating rows in reading order.
- UI UX Pro Max informed the section hierarchy, normal scrolling, image optimization, focus behavior, and responsive spacing. Its generic palette and font suggestions were not adopted: the existing identity and Arabic typography take precedence.
- Section entrances stagger text and imagery once through an IntersectionObserver. The hero draws a decorative route in its own space below the destination button; its traveller and scroll cue finish within five seconds. A thin progress line tracks the page. Content remains visible without motion APIs; reduced motion cancels entrances and disables decorative movement. Image frames reserve space before loading.
- The source example has a clear event heading and a real link to Dorar event 42. Its small book GIF flips pages while visible, switching to a still image offscreen or with reduced motion. Regenerate both icon files with `python scripts/build-book-icon.py` (Pillow required).
- Language changes use a 780ms View Transition wipe: left to right for English and right to left for Arabic. The layout, document language, and reading direction update together behind the snapshot. Visible preview images decode before the new snapshot; a mid-page change keeps the current section in place. Rapid toggles skip obsolete transitions. Reduced motion changes the language immediately; unsupported browsers get a short opacity transition. Navigation cancels an active sweep.

## Real interface previews

`public/images/landing/` contains compressed WebP captures of the actual Journey page in both languages. The overview uses a separate mobile capture; all previews load lazily. They are illustrative images, not embedded app controls. Surrounding text and alternatives convey their purpose without relying on text inside the images.

Refresh captures when the Journey UI or the relevant data changes. With Chrome installed and `playwright` and `sharp` available to Node (for example through `NODE_PATH` in the Codex bundled runtime):

```sh
npm run dev
node scripts/capture-landing.cjs http://127.0.0.1:5173
node scripts/check-landing.cjs http://127.0.0.1:5173
node scripts/check-motion.cjs http://127.0.0.1:5173
```

Use the URL printed by Vite if its default port is occupied. The capture script requires the development server and resolves stable Dorar event IDs through the app loader: event 12 (first revelation), event 9 (Khadijah), and event 42 (Hijrah). Answers and questions are produced by the working Journey UI. Browser contexts are isolated and do not change anyone's saved journey progress.

The browser checks cover Arabic and English at 1440, 768, 390, and 320 pixels; image loading; scroll-link focus; both Journey links; history navigation; enlarged text; contrast settings; keyboard activation; normal and reduced motion; and landscape. The motion check also exercises both sweep directions, rapid toggles, section-position preservation, reduced-motion changes during a sweep, and the unsupported-browser fallback. Screenshots are saved under `qa/landing-*`. These browser tools are development utilities, not application dependencies.

Run `npm test` and `npm run build` after changes. Review the generated screenshots for visual quality in addition to the automated checks.
