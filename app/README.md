# Islamathon

An Arabic-first, bilingual web experience for exploring the Sirah in place and time. Built with React and TypeScript, it combines the Islamathon design (animated navigation, reading preferences) with the Bidaya data package.

**Status:** working prototype (v11). The Journey page has a period map of Arabia, the full timeline of 142 Dorar events, event cards with their verses and Companions, story mode, and "Ask the map". The Spread page shows the events reaching across Arabia year by year. All content is read at runtime from the CSV files in `public/data/`.

## Editing the data

Every piece of content comes from the files in **`public/data/`**. Nothing is written into the code or the HTML.

1. Open the CSV in Excel (or any spreadsheet app). Keep the header row and column names unchanged.
2. Edit, then save as **CSV UTF-8**.
3. Reload the page. While `npm run dev` is running, changes show on reload; on a deployed site, replace the file on the host. No rebuild is needed.
4. Run `npm test` to check the data. It loads every file and reports broken references (for example an event whose `رمز_المكان` is missing from `4_places.csv`). The browser console shows the same warnings with a `[data]` prefix.

| File | What it controls |
| --- | --- |
| `2_sirah_events.csv` | Events, their order (`ترتيب_العرض`), dates, places, coordinates and location precision |
| `12_dorar_titles_and_texts_ar_en.csv` | English titles and texts for each event |
| `4_places.csv` | Place names and coordinates |
| `1_related_surahs.csv` | Surah and verse records shown on event cards |
| `3_links_surahs_sirah.csv` | How each verse record attaches to the timeline (direct, context, stage, placeholder…) |
| `6_sahaba.csv` | Companions and their cited synopses |
| `5_sirah_map.geojson` | Sirah routes (Hijrah, Isra', Taif, Tabuk, Farewell Hajj) |
| `map_labels.csv` | Period map labels: regions (`إقليم`), powers (`قوة`), seas (`بحر`); position, size (`كبير`/`متوسط`/`صغير`) and rotation |
| `map_routes.csv` | Caravan routes, as `lat lon; lat lon; …` |

The README of the data package (IslamthonDataandstuff) explains every column.

## The map

The map is a period map, drawn as SVG: coastlines only (Natural Earth 1:50m, public domain), with the regions, powers and seas of the time from `map_labels.csv`. It draws no modern borders, so no country outline is approximated. Region positions are approximate and labelled for orientation only. To regenerate the coastline after changing the map's extent, run `node scripts/build-land.mjs`.

## Ask the map

`src/assistant/answer.ts` answers from the sources only: Dorar event texts, the Companions' synopses and the verse records. Each answer names its source and moves the map to the event. Questions asking for a ruling are referred to an official fatwa body, and questions with no matching source get an apology (deck slides 5–7). It runs in the browser, with no API key. To add an LLM later, send the passages from `retrieve()` to a server-side model and keep these rules.

![Arabic navigation preview](qa/navigation-desktop-arabic.jpg)

## Features

- **Arabic and English:** mirrored right-to-left and left-to-right layouts with translated interface text.
- **Three destinations:** The Beginning, Spread of Islam, and Islam Journey.
- **Animated navigation:** logo transitions, a waypoint menu, browser Back/Forward support, and direct page URLs.
- **Reading preferences:** text scaling, line and character spacing, contrast themes, Saudi/Plex fonts, highlighted links, and stronger focus indicators.
- **Keyboard support:** menu and dialog focus management, Escape dismissal, and keyboard-operable preference controls.
- **Reduced motion:** respects the operating system preference and the in-app setting.
- **AI interaction demo:** animated question, processing, answer, cancel, and reset states.
- **Local fonts:** typography assets are bundled with the application; no font CDN is required at runtime.

## Technology

| Area | Tools |
| --- | --- |
| Interface | React 19, TypeScript 5.9 |
| Development and build | Vite 7 |
| Tests | Vitest 5, jsdom |
| Styling and motion | CSS, SVG, browser animation APIs |
| Navigation | Browser History API |

## Getting started

### Prerequisites

- **Node.js 24.x** and its bundled npm. This version supports the development, build, and test dependencies in the lockfile.
- Git for cloning the repository.
- A modern browser.

No database, API key, environment file, or backend service is required to run the prototype.

### Install and run

```sh
git clone https://github.com/elyasos/islamathon.git
cd islamathon
npm ci
npm run dev
```

Open the URL printed by Vite, normally **http://127.0.0.1:5173**. Vite may select another port if that port is already occupied. `npm ci` installs the dependency versions recorded in `package-lock.json`.

The interface opens in Arabic. Use the language control to switch to English and the destination menu to explore the pages.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server with hot reload |
| `npm test` | Run the automated tests once |
| `npm run build` | Check TypeScript and generate the production build in `dist/` |
| `npm run preview` | Serve an existing production build locally |
| `npm exec vitest` | Run tests in watch mode during development |

To preview the production build:

```sh
npm run build
npm run preview
```

Open the printed preview URL, normally **http://127.0.0.1:4173**.

To test on another device on the same network:

```sh
npm run dev -- --host 0.0.0.0
```

Open the computer's local network address and the printed port on that device.

## Pages

| URL | Page | Current implementation |
| --- | --- | --- |
| `/` | The Beginning | Landing title and shared navigation |
| `/spread` | Spread of Islam | Year slider and map of events reaching across Arabia |
| `/journey` | Islam Journey | Period map, timeline, event cards, story mode, and Ask the map |

The language selection stays in memory during navigation and resets on a full reload. Leaving Journey and returning starts a fresh AI demo.

## Project structure

```text
src/
├── App.tsx                   # Shared shell, language, and viewport handling
├── main.tsx                  # React entry point
├── i18n.ts                   # Arabic and English interface copy
├── index.css                 # Global styles and reading preferences
├── accessibility/            # Preferences provider and settings dialog
├── assets/                   # Source logo asset
├── components/               # Brand logo, AI orb, and map placeholder
├── navigation/               # Routes, history handling, menu, and transitions
└── pages/                    # Landing/chapter titles and Journey page
public/
├── favicon.svg
└── fonts/                    # Saudi font files and source notices
qa/                           # Saved browser-review screenshots
Logo.svg / Logo.png           # Original supplied brand assets
*.textClipping                # Original supplied animation references
```

Tests live alongside the relevant components and navigation modules. The supplied `globe effects.textClipping` reference is currently unused.

## Configuration and integration

### Reading preferences and storage

Validated reading settings are saved in the browser's `localStorage` under `islamathon.accessibility.v1`. If storage is unavailable, settings continue to work in memory. Use the reset control in the settings dialog to restore defaults.

Questions and answers remain in component memory. The default AI demo does not send them to a backend.

### Connecting an AI service

`src/components/MorphOrb.tsx` exposes these optional props:

| Prop | Type | Purpose |
| --- | --- | --- |
| `locale` | `'ar' \| 'en'` | Interface language |
| `onSubmit` | `(text: string) => Promise<string> \| string` | Supply an answer from your integration |
| `minThinkMs` | `number` | Minimum processing animation duration |
| `speed` | `number` | Animation speed |
| `reducedMotion` | `boolean` | Override the component's system motion preference |

The current `JourneyPage` uses the localized demo answer. To connect a service, pass an `onSubmit` callback there and handle transport, errors, and request cancellation in your integration. Keep service credentials on a server; client-side Vite variables are visible to users.

Escape or Cancel stops the UI sequence and ignores late answers; it does not automatically cancel an external network request. Add `?debug` to the Journey URL to expose animation speed and replay controls.

## Production deployment

The application builds to static files:

```sh
npm ci
npm run build
```

Configure your hosting service with:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | `24.x` |
| Runtime environment variables | None for the current prototype |

**Configure an SPA fallback:** requests to `/spread` and `/journey` must serve `index.html` when no static file matches. Without that rewrite, refreshing an inner page may return a 404. Existing assets must continue to be served normally.

The default Vite base path is `/`. If hosting under a subdirectory, configure Vite's `base` and adapt route handling in `src/navigation/routes.ts` and `src/navigation/useNavigation.ts` to that prefix. The current routes assume hosting at the domain root.

`npm run preview` is intended for local build verification. No production hosting configuration or deployment is included in this repository.

## Verification

Run both checks before submitting changes:

```sh
npm test
npm run build
```

The current suite includes 29 tests across four files, covering AI lifecycle and cleanup, navigation/history behavior, transition geometry, waypoint endpoints, reduced motion, preference persistence, storage failures, dialog focus, and preference changes during AI processing.

Saved browser reviews in `qa/` cover desktop and mobile layouts, both languages, navigation, transitions, enlarged text, contrast themes, and compact viewports. These screenshots document prior reviews; they are not an automated browser test suite. A physical mobile keyboard and browser page zoom have not been verified.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Installation fails or reports an unsupported engine | Check `node --version`; use Node 24.x, then run `npm ci` |
| The default development port is unavailable | Use the alternate URL printed by Vite, or run `npm run dev -- --port 5174` |
| A refreshed inner page returns 404 after deployment | Configure the host's SPA fallback to `index.html` |
| Ask the map apologises for a question | No source text matched it well enough; try the event, place or Companion name |
| The Journey page says the data could not be loaded | Check that the CSV files are in `public/data/` and are served by the host |
| Settings disappear after a reload | Browser storage may be unavailable or disabled; settings then last only for the session |
| Animations are reduced | Check the operating system motion setting and the in-app reading preferences |

## Contributing

Keep Arabic and English copy in sync, preserve mirrored layouts, and check keyboard focus and reduced-motion behavior when changing interactions. Include a clear explanation of your change and any relevant screenshots in a pull request. Run the test suite and production build before submitting.

## Assets and licensing

No project-wide software license has been selected. Third-party assets retain their own terms and notices.

Saudi Regular and Bold are provided unchanged from the Ministry of Culture source; embedded copyright and trademark notices are transcribed in [public/fonts/NOTICES.md](public/fonts/NOTICES.md). Fontsource dependencies carry their own license files. Review the applicable asset terms before redistribution or production use.
