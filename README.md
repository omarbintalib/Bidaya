# Bidaya (بداية) – Data Package

Data for the interactive Seerah map: Seerah events, the surahs and verses related to each event or stage, places, and Companions, plus the links between them.

**Sources.** Every record traces back to one of two approved sources:

- **Dorar's historical encyclopedia** (الموسوعة التاريخية – الدرر السنية), for the Seerah events. Each event has a direct link.
- **Sahih al-Bukhari and Sahih Muslim**, for the ASB- records. Each row has hadith numbers. Muslim uses Fuad Abd al-Baqi's numbering.
- **Dorar's Tafsir Encyclopedia** (موسوعة التفسير – الدرر السنية), for the TAF- records. Each row gives the evidence and its grading as the encyclopedia quotes it, with a link to the page.

Nothing was added from memory or from outside sources.

**Format.** All CSVs are UTF-8 with BOM, comma-separated, so they open correctly in Excel. Column names are in Arabic.

---

---

## The app (`app/`)

`app/` is the interactive version (v11), built on the Islamathon design. It reads the CSV files in this folder directly, so editing a CSV here and reloading the page is all it takes to update the app. See `app/README.md` for how to run it (`cd app && npm ci && npm run dev`).

Two files were added for the period map:

| File | What it is |
|------|------------|
| `map_labels.csv` | Regions, powers and seas shown on the map, with approximate positions for orientation |
| `map_routes.csv` | The Quraysh caravan routes (winter to Yemen, summer to al-Sham), approximate |

Columns added for the app (filled only where the Dorar texts state it, each with its quote):

| File | Columns | Meaning |
|------|---------|---------|
| `6_sahaba.csv` | `الفئة`, `وقت_الإسلام`, `أسماء_أخرى`, `Aliases_EN` | Group (Companions, the Prophet's family ﷺ, Quraysh, hypocrites, Jews of Madinah, rulers…), when the person became Muslim (or that they did not), and other names used to find them in the texts. People `PER-001`… are the new non-Companion figures; their facts are in `7_sahaba_references.csv`. |
| `4_places.csv`, `map_labels.csv` | `حدث_بلوغ_الإسلام`, `شاهد_بلوغ_الإسلام` | The Dorar event from which Islam had reached the place or region, with the quote. The map lights these up as the story reaches that event. |

New files for the story (each line quotes its Dorar event; the app's tests check every quote is verbatim):

| File | What it is |
|------|------------|
| `quiz.csv` | One question per chapter, answered by choosing a place (`الإجابة` and `الخيارات` are keys from `4_places.csv`), with the explanation, the quote and its Dorar link. The app adds more questions per chapter from the events themselves (see `app/README.md`) |
| `route_stops.csv` | Named stops for the route walks (the Hijrah, the journey to Ta'if, the Farewell Hajj), each with the Dorar line for that stop. Only stops the sources describe are listed. |

## Files at a glance

| # | File | Rows | What it is |
|---|------|------|------------|
| 1 | `1_related_surahs.csv` | 116 | Surahs and verses related to Sirah events or stages: 84 from the Sahihayn (ASB-) and 32 from the Dorar Tafsir Encyclopedia review (TAF-) |
| 2 | `2_sirah_events.csv` | 142 | Seerah events from Dorar, with titles, dates, order and locations |
| 3 | `3_links_surahs_sirah.csv` | 116 | **The only file that connects surahs/verses to events.** One row per record |
| 4 | `4_places.csv` | 68 | List of places with coordinates |
| 5 | `5_sirah_map.geojson` | 144 | Map layer: 139 event pins and 5 routes |
| 6 | `6_sahaba.csv` | 74 | Companions, with cited synopses |
| 7 | `7_sahaba_references.csv` | 136 | One row per fact about a Companion, with the source quote and link |
| 9 | `9_dorar_tafseer_review.csv` | 762 | Decision and reason for every candidate from the Dorar Tafsir Encyclopedia crawl |
| 11 | `11_dorar_titles_ar_en.csv` | 142 | Every Sirah event's title as Dorar gives it, in Arabic and English, with both Dorar links |
| 12 | `12_dorar_titles_and_texts_ar_en.csv` | 142 | The same titles plus the full Dorar text of each event, in Arabic and English |
| 8 | `8_hadith_verification.csv` | 289 | Every hadith number in the package, checked against the hadith text, with a sunnah.com link |

Files 1, 2, 4 and 6 hold the core records. Files 3 and 7 connect them.

---

## How the files connect

```
1_related_surahs.csv ──(المعرف)──► 3_links_surahs_sirah.csv ◄──(dorar_event_number = رقم_حدث_الدرر)── 2_sirah_events.csv
                                                                                                                          │
                                                                                                  (رمز_المكان) ───────────┴──► 4_places.csv
6_sahaba.csv ──(معرف_الصحابي)──► 7_sahaba_references.csv ──(معرف_المصدر_في_المشروع: "حدث N" or ASB-xxx)──► events / surah records
```

**Key IDs**

| ID | Format | Used in |
|----|--------|---------|
| Asbab ID | `ASB-001` to `ASB-085` | files 1, 3, 6, 7 |
| Dorar event number | integer, e.g. `59` (Badr) | files 2, 3, 5, 6, 7 |
| Place key | text, e.g. `badr`, `uhud` | files 2, 4 |
| Companion ID | `SAH-001` to `SAH-074` | files 6, 7 |

> ⚠️ **Always use `dorar_event_number`, never row position.** Dorar's numbers are not sequential. Some numbers are skipped, and Dhat al-Riqa' is event 77 even though it appears among events in the 100s. The page link is always `https://dorar.net/history/event/{dorar_event_number}`.

---

## 1. `1_related_surahs.csv`

Two kinds of records share this file. **ASB-** rows come from Bukhari and Muslim. **TAF-** rows come from the Dorar Tafsir Encyclopedia review; for these, `الدليل` gives the source and the grading exactly as the encyclopedia quotes it, and `روابط_موسوعة_التفسير` links the page. ASB rows that the encyclopedia also confirms have that column filled too.

- **Quran quotations** inside `الحدث` and `وجه_الارتباط` are always inside ﴿ ﴾ and are copied verbatim, with vowels, from the Mushaf text; each was checked to exist in the verse cited. People's words are inside «» (even when they match a verse, such as Abu Jahl's or Ibn Ubayy's words), so speech is never shown as Quran.
- **`العنوان_EN` / `صيغة_العرض_EN`**: English title and display phrase for the English interface.
- **`روابط_المصحف`**: a link per verse reference to the Madinah Mushaf (Hafs) on the King Saud University site, e.g. `https://quran.ksu.edu.sa/index.php?l=ar#aya=2_189&m=hafs`. Use `l=en` for the English interface.
- **`نطاق_السورة`**: "السورة كاملة" when the whole surah relates to the event (al-Anfal → Badr, al-Hashr → Banu al-Nadir, al-Tawbah → Tabuk, al-Masad, al-Kawthar). The interface then shows "السورة كاملة" instead of a verse range.
- New link types from the review: `باتفاق المفسرين` (scholarly agreement, the scholar named), `قول المفسرين` (a named scholar's statement), `السورة نزلت في الحدث` (surah-level).


Fields to know:

- **`مرجع_الآيات`**: machine-readable verse reference, e.g. `2:189` or `25:68-70; 39:53`. Use it to fetch the verse text from the King Fahd Complex Mushaf. **The files contain no Quran text on purpose.** Never type or machine-translate verses.
- **`صحيح_البخاري` / `صحيح_مسلم`**: hadith numbers. `—` means the hadith isn't in that collection. Bukhari uses the Fath al-Bari numbering, and Muslim uses Fuad Abd al-Baqi's numbering. These are the same numbers dorar.net and sunnah.com use; sunnah.com shows sub-narrations as 160a, 160b, and so on.
- **`تحقق_الأرقام` / `روابط_التحقق`**: the result of the full number review and a sunnah.com link for each number. The full log is in file 8.
- **`نوع_الارتباط`**: what kind of connection the hadith describes. There are 12 types, for example سبب نزول صريح (explicit reason), استشهاد بالآية (the Prophet ﷺ recited the verse), تفسير صحابي (a Companion's interpretation).
- **`صيغة_العرض`**: the wording the card should use for that type, e.g. "نزلت في هذا الموقف" or "تلاها النبي ﷺ في هذا الموقف". **Use this instead of always writing "نزلت"**, so the app never claims more than the source says.
- **`التعديلات`**: what was corrected from the original file and why.
- **`حالة_المراجعة`**: 80 rows are marked "معدّل – يحتاج مراجعة" (edited, needs review) and 5 are "معتمد" (approved).

> **ASB-035 (Bi'r Ma'unah, abrogated recitation) was removed**, since it is not a surah or verse in the Mushaf.

## 2. `2_sirah_events.csv`

- **`العنوان_في_الدرر`**: the official title, copied exactly from dorar.net.
- **`ترتيب_العرض`**: **use this to order the timeline**, not Dorar's order. Dorar places year-only events at the start of their year, so six events were moved, for example Ibn Salam's Islam to after the Hijrah and Hunayn to before the siege of Taif. The reason for each move is in `ملاحظة_الترتيب`.
- **`السنة_الهجرية`**: negative numbers mean before the Hijrah, e.g. `-13` is 13 BH.
- **`الفترة`**: one of قبل البعثة (before prophethood, 11 events), العهد المكي (Meccan), الهجرة (Hijrah), العهد المدني (Madinan).
- **Location columns:**
  - `دقة_الموقع` (location precision): دقيق (exact pin), تقريبي (approximate pin, show a label), منطقة (region, draw a shaded area), غير محدد (no pin; the event stays on the timeline only).
  - `أساس_التحديد` (basis): "نص الدرر" means the place is named in the Dorar text, and the supporting phrase is in `الشاهد_من_الدرر`. "استنتاج" means the place was inferred from context and needs checking.
- **`النص`**: the full Dorar text. This is the main input for the assistant's retrieval.

## 3. `3_links_surahs_sirah.csv`, the linking file

Each record has exactly one link type:

| `نوع_الربط` | Count | How to display |
|---|---|---|
| مباشر (direct) | 60 | On the event's card |
| سياق (context) | 8 | As a "من سياق هذه المرحلة" link from the card. **It is not the event itself.** |
| موضع مقترح (suggested position) | 8 | On the timeline after the named event, labelled as an estimate. The reason is in `سبب_الموضع`. |
| بعد الحدث (after the event) | 2 | On the event's card with the tag "نزلت بعد هذا الحدث" |
| مرحلة (period) | 16 | In a "verses revealed in this stage" section at the end of the stage |
| عنصر نائب (placeholder) | 22 | **Not shown on the timeline.** The sources give no connection to any event. Show them in a separate panel. |

- **`الموضع_في_الخط_الزمني`**: matches `ترتيب_العرض` in file 2. It is blank for placeholders.
- **`النطاق_من` / `النطاق_إلى`**: the range of the stage, also in `ترتيب_العرض` values.
- **`نص_الربط_في_الواجهة`**: the label text, ready to display.

## 4. `4_places.csv`

`دقة_الإحداثيات` (coordinate confidence) is either "مؤكد" (a well-documented site) or "تقريبي – يحتاج تحقق" (approximate, needs checking). The approximate ones are mostly minor expedition sites.

## 5. `5_sirah_map.geojson`

The file loads directly into Leaflet or Mapbox.

- **Event points** (`kind: event`) have these properties: `title`, `hijri_year`, `period`, `precision`, `dorar_url`, `asbab` (IDs of the records linked directly to the event), and `order`.
- **Routes** (`kind: route`) are the Hijrah, the Isra', the Taif journey, Tabuk, and the Farewell Hajj. All are approximate, and each explains why in its `note`. On the Hijrah route, the cave of Thawr, Quba and Madinah are certain. The coastal point is approximate, because Dorar only says "طريق السواحل" (the coastal road).

## 6–7. Companions

- **`نبذة_موثقة`** (cited synopsis) is assembled **only** from facts in file 7.
- **`الوفاة_أو_الاستشهاد`** (death or martyrdom) is filled only when our sources state it. Otherwise it reads "غير مذكورة في مصادر المشروع" (not stated in the project's sources).
- **In file 7, every fact has its exact quote and source link.** A script checked all 136 quotes against the source text, and all match.
- Sensitive details, such as Aisha's age at marriage, are left out of the synopses on purpose. This is an editorial choice the content lead should confirm.

---

## Display rules (from the deck)

1. Quran text comes **only** from the Mushaf: quotations in the files are verbatim and verified, and reading links open the Madinah Mushaf (King Saud University site).
2. Use the honorifics already in the data: ﷺ for the Prophet, and رضي الله عنه/عنها for Companions. Never depict the Prophet ﷺ or the Companions.
3. When something is uncertain, show the uncertainty. That means approximate pins, labels on estimated positions, and placeholders that stay off the timeline.
4. The assistant answers only from `النص` (file 2) and `وجه_الارتباط` (file 1), and cites the link or hadith number.

---

## Arabic and English from Dorar (files 11–12)

- **Arabic titles and texts:** all 142 events, from dorar.net/history.
- **English texts:** all 142 events, from dorar.net/en/history. The 131 events in the v9 prototype came through its data. The 11 events before the first revelation (1–11) were copied by the team from the Dorar site, matched to their events by Dorar's exact English title and Hijri date. They are kept word for word, including Dorar's own typos, with paragraph breaks as on the site.
- **English titles:** all 142 events, taken exactly from dorar.net/en/history (`title_en_dorar`), including Dorar's own spellings and typos. `title_en_display` shows the same words in normal title case, since Dorar writes them in capitals; this is what the prototype shows. Each title was matched to its event by content (names and places checked against the event's English text), because Dorar's English numbering differs from the Arabic one in places and contains duplicate entries where the Arabic list skips numbers (64, 81, 82).

## English for the English interface (to be filled by the team)

These columns are empty on purpose. Nothing in them is machine-translated: a reviewer fills them, and the English interface shows the Arabic (marked as Arabic) until a cell is filled. A repeated value only needs filling once — every row with the same Arabic takes the same English.

| File | Column | Next to | To fill |
|---|---|---|---|
| `1_related_surahs.csv` | `السورة_EN` | `السورة` | 44 surah names (shared by all their rows) |
| `1_related_surahs.csv` | `وجه_الارتباط_EN` | `وجه_الارتباط` | 116 texts: how each verse connects to its event |
| `1_related_surahs.csv` | `الراوي_EN` | `الراوي` | 55 narrator names (shared) |
| `3_links_surahs_sirah.csv` | `نص_الربط_في_الواجهة_EN` | `نص_الربط_في_الواجهة` | 8 timing labels (shared), e.g. «وقعت في هذه المرحلة، ولا يُعرف تاريخها بدقة» |
| `6_sahaba.csv` | `نبذة_موثقة_EN` | `نبذة_موثقة` | 98 synopses |
| `6_sahaba.csv` | `وقت_الإسلام_EN` | `وقت_الإسلام` | 35 entries |
| `6_sahaba.csv` | `الوفاة_أو_الاستشهاد_EN` | `الوفاة_أو_الاستشهاد` | 25 entries |

Quotes from the sources (Dorar's Arabic text, hadith wording) stay in Arabic in both interfaces.

## Open items

| Item | Owner |
|---|---|
| Review the edited ASB rows and the 32 new TAF rows. All 289 hadith numbers were checked against the hadith texts (file 8); spot-check a sample using the links | Hassan |
| Check the approximate coordinates and the 17 inferred locations | Hassan |
| Review the 9 suggested timeline positions; fill in placeholders if a connection is found | Hassan |
| Decide whether the 11 pre-prophethood events are a prologue or are removed, and update the deck's scope line to match | Team |
| Flag events resting on disputed reports (e.g. Dorar events 58 and 61: Asma' bint Marwan, Abu 'Afak), and decide how to frame sensitive events for a beginner audience | Hassan |
| Fetch the Quran text and an approved English translation by `مرجع_الآيات` | Omar / Elyas |
| English versions of titles, summaries and labels; build the approved glossary | Omar + Hassan |
| Short card summaries and a "who took part" field for events | Omar + Hassan |
| Split `النص` into source-tagged chunks for retrieval, and write the slide-7 test question set | Omar |

**A note on removed data.** ASB "Yasin and the decayed bone" (original row 12) was removed. It isn't in Bukhari or Muslim; it's reported by al-Hakim from Ibn Abbas. Add it back only with its real source and grading.
"# IslamthonDataandstuff" 
