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
| `islam_growth.csv` | Counts of Muslims at a place as Dorar gives them (emigrants to Abyssinia, the men of Yathrib at al-Aqabah, the armies that marched from Madinah), each with what it counts and its quote. The glow grows with them (see below) |
| `quran_en.csv` | English for each Quran quotation inside the English reasons (`وجه_الارتباط_EN`): Sahih International, quoted word for word from Quranpedia, with the ayah reference and link (see below) |
| `map_arcs.csv` | The letters sent from Madinah and the delegations that came to it, drawn as curves while their event is on screen (see below) |

Columns added for the app (filled only where the Dorar texts state it, each with its quote):

| File | Columns | Meaning |
|------|---------|---------|
| `6_sahaba.csv` | `الفئة`, `وقت_الإسلام`, `أسماء_أخرى`, `Aliases_EN` | Group (Companions, the Prophet's family ﷺ, Quraysh, hypocrites, Jews of Madinah, rulers…), when the person became Muslim (or that they did not), and other names used to find them in the texts. People `PER-001`… are the new non-Companion figures; their facts are in `7_sahaba_references.csv`. |
| `4_places.csv`, `map_labels.csv` | `حدث_بلوغ_الإسلام`, `شاهد_بلوغ_الإسلام` | The Dorar event from which Islam had reached the place or region, with the quote. The map lights these up as the story reaches that event. |

New files for the story (each line quotes its Dorar event; the app's tests check every quote is verbatim):

| File | What it is |
|------|------------|
| `quiz.csv` | One question per chapter, answered by choosing a place (`الإجابة` and `الخيارات` are keys from `4_places.csv`), with the explanation, the quote and its Dorar link. The app adds more questions per chapter from the events themselves (see `app/README.md`) |
| `route_stops.csv` | Named stops for the route walks (15 routes, from the journeys to al-Sham to the march on Makkah), each with the Dorar line for that stop, quoted word for word. Only stops the sources name are listed. |

## Files at a glance

| # | File | Rows | What it is |
|---|------|------|------------|
| 1 | `1_related_surahs.csv` | 94 | Surahs and verses related to Sirah events or stages: 62 from the Sahihayn (ASB-) and 32 from the Dorar Tafsir Encyclopedia review (TAF-) |
| 2 | `2_sirah_events.csv` | 142 | Seerah events from Dorar, with titles, dates, order and locations |
| 3 | `3_links_surahs_sirah.csv` | 94 | **The only file that connects surahs/verses to events.** One row per record |
| 4 | `4_places.csv` | 68 | List of places with coordinates |
| 5 | `5_sirah_map.geojson` | 155 | Map layer: 139 event pins and 16 routes |
| 6 | `6_sahaba.csv` | 98 | People (74 Companions and 24 other figures), with cited synopses |
| 7 | `7_sahaba_references.csv` | 236 | One row per fact about a person, with the source quote and link |
| 9 | `9_dorar_tafseer_review.csv` | 762 | Decision and reason for every candidate from the Dorar Tafsir Encyclopedia crawl |
| 11 | `11_dorar_titles_ar_en.csv` | 142 | Every Sirah event's title as Dorar gives it, in Arabic and English, with both Dorar links |
| 12 | `12_dorar_titles_and_texts_ar_en.csv` | 142 | The same titles plus the full Dorar text of each event, in Arabic and English |
| 8 | `8_hadith_verification.csv` | 223 | Every hadith number in the package, checked against the hadith text, with a sunnah.com link |

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
- **`حالة_المراجعة`**: 5 rows are "معتمد" (approved by the content lead). The others were reviewed on 5 October (Claude, at the team's request) and are marked "رُوجع … بانتظار اعتماد مسؤول المحتوى": checked against the sources the project holds (verse quotes against the Tanzil Quran text, hadith numbers and narrators against sunnah.com, years against the linked Dorar event). For the 32 TAF rows the hadith gradings (التخريج والدرجة) could not be checked and are flagged for the content lead.

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
| مباشر (direct) | 58 | On the event's card |
| سياق (context) | 8 | Under "آيات في موضوع هذا الحدث" (Verses on this event's subject) in the card. **It is not the event itself.** |
| موضع مقترح (suggested position) | 9 | On the timeline after the named event, labelled as an estimate. The reason is in `سبب_الموضع`. |
| بعد الحدث (after the event) | 2 | On the event's card with the tag "نزلت بعد هذا الحدث" |
| مرحلة (period) | 17 | Under "آيات نزلت في هذه السنوات" (Verses revealed in these years), folded, in every event of its span of years |
| عنصر نائب (placeholder) | 0 | None left. The 22 records the sources could not place in time (ASB-016, 019, 059, 060, 062–069, 071–077, 079, 081, 085) were removed; they are in the git history if a source later dates them. |

- **`الموضع_في_الخط_الزمني`**: matches `ترتيب_العرض` in file 2. It is blank for placeholders.
- **`النطاق_من` / `النطاق_إلى`**: the range of the stage, also in `ترتيب_العرض` values.
- **`نص_الربط_في_الواجهة`**: the label text, ready to display.

## 4. `4_places.csv`

`دقة_الإحداثيات` (coordinate confidence) is either "مؤكد" (a well-documented site) or "تقريبي – يحتاج تحقق" (approximate, needs checking). The approximate ones are mostly minor expedition sites.

## 5. `5_sirah_map.geojson`

The file loads directly into Leaflet or Mapbox.

- **Event points** (`kind: event`) have these properties: `title`, `hijri_year`, `period`, `precision`, `dorar_url`, `asbab` (IDs of the records linked directly to the event), and `order`.
- **Routes** (`kind: route`): the line is drawn while its Dorar event (`ref`, e.g. `event_17+19`) is on screen, and a route with at least two stops in `route_stops.csv` can be walked stop by stop. The Walk button appears on the event the stops quote; the second Hijrah to Abyssinia draws the shared line but has no Walk button, since both stops quote the first. While a route or letter is on screen, the map zooms out to show all of it. All lines are approximate, and each `note` says why; the stops are the places the Dorar text names.

| Route | Dorar events | Stops (named in the text) |
|---|---|---|
| The Hijrah to Madinah | 42 | Cave of Thawr, the coastal road, Quba, Madinah |
| The Isra' | 32 | — (a symbolic line between the two mosques) |
| The journey to Ta'if | 25, 26 | Ta'if, Nakhlah |
| The Hijrah to Abyssinia (first and second) | 17, 19 | Makkah, Abyssinia. The sea crossing is an estimate: Dorar names no port |
| Abu Musa's Hijrah by way of Abyssinia | 104 | Yemen, Abyssinia, Khaybar |
| The journeys to al-Sham (with Abu Talib; Khadijah's trade) | 6; 10 | Busra; the market of Busra |
| Aminah's journey to Madinah | 3 | The house of al-Nabighah in Madinah, al-Abwa' |
| Badr, al-Hudaybiyah, Khaybar | 59, 101, 102 | Badr; al-Hudaybiyah; Khaybar |
| The army of Mu'tah | 122 | Ma'an, Mu'tah |
| The march to the Conquest of Makkah | 127 | al-Kadid, Marr al-Zahran, Makkah (Kada') |
| Hunayn and Ta'if | 132, 131 | The valley of Hunayn, Ta'if |
| Tabuk, the Farewell Hajj | 138; 143 | —; Madinah and onward |

The English route names are in `ROUTE_EN` in `app/src/data/load.ts`.

### The spread of Islam on the map

Each place in `4_places.csv` and each region in `map_labels.csv` can carry `حدث_بلوغ_الإسلام`, the Dorar event from which Islam had reached it, with the quote in `شاهد_بلوغ_الإسلام` (a test checks it is word for word in that event). As the story passes that event, the place glows and the region's name turns gold.

- **Makkah (event 14) and Madinah (event 34)**, and the sites inside them, light first. Abyssinia lights at the first Hijrah (17), al-Yamamah with Thumamah (89), al-Bahrayn when al-Mundhir ibn Sawa accepted Islam (106), and al-Bahrayn, Yemen and Oman when their kings accepted Islam on receiving the Prophet's ﷺ letters (106, 7 AH).
- **The rest of Arabia lights at the Year of Delegations (event 135, 9 AH)**: «فلمَّا كانت وَقعةُ أهلِ الفَتحِ بادَر كُلُّ قومٍ بإسلامِهم». This is a statement about the Arabs in general, not about each place by name, and `ملاحظة_بلوغ_الإسلام` says so for Tihamah and Najd.
- **From the Year of Delegations, each reached region is washed in gold**, so the whole territory reads as reached, not just its few named places. Before then a reached region only has its gold name, because Islam was in a few of its towns, not across it.
- **Al-Sham, Iraq, Byzantium and Persia stay unlit**: Islam did not reach them in the Prophet's ﷺ lifetime.
- The map runs from 28°E to 60°E and from 4°N to 38°N, so Oman and Alexandria are on it (`app/scripts/build-land.mjs`).

### Names and numbers as they were at the time

- **Names change with the story.** `4_places.csv` has `الاسم_قبل` / `Name_Before_EN` and `حدث_الاسم`: the place is called by its earlier name until that Dorar event. al-Madinah is **Yathrib** until the Prophet's ﷺ Hijrah (event 42), the name Dorar itself uses before it (event 34: «وانتشر الإسلامُ في أهلِ يَثْرِبَ»). Quba is plain **Quba** until its mosque is built (event 43). Event cards say "Yathrib (later al-Madinah)", and the map, the walks and the assistant use the name of the time.
- **Every place name is a name of the time.** Later honorifics and modern names were removed:
  - **Later honorifics:** مكة المكرمة → مكة, المدينة المنورة → المدينة, الكعبة المشرفة → الكعبة.
  - **Later names of landmarks:** Jabal al-Nur, Jabal al-Rahmah (now عرفة, Dorar's word) and Masjid al-Bay'ah, which was built after his time.
  - **Modern place names:** al-Shumaisi, al-Ha'it, "Jordan" (Mu'tah is now "the land of al-Balqa'", Dorar 122's term) and "Red Sea coast".
  - **Later term:** المسجد النبوي → مسجد رسول الله ﷺ.
  - **English sea names:** each sea now has its Arabic name of the time first, such as "Sea of al-Qulzum (the Red Sea)".
- - **Region names say what they meant then.** Pointing at a region or sea on the map (tapping, on a phone) explains it from `map_labels.csv` (`ملاحظة` / `Note_EN`):
  - **al-Bahrayn** was the whole eastern region of Arabia, not today's island country (Sahih al-Bukhari 4371: Jawatha, «قَرْيَةً مِنَ الْبَحْرَيْنِ»).
  - **Oman, Yemen, Iraq and al-Sham** were regions, not today's states.
  - **The seas** carry their names of the time: al-Qulzum, al-Rum, Faris.
- - **Names appear gradually.** A place is named on the map from its first event on, so places and mosques do not show before the story reaches them.
- **The glow grows with the Muslims the sources count.** `islam_growth.csv` gives, per place and event, a number Dorar states, word for word. A lit place glows faintly when no number is given and brighter and wider as the count grows, up to the 30,000 of Tabuk (scaled on a logarithm, so 16 emigrants already shows). Each count is a lower bound and says what it counts, such as "Muslims who marched to Uhud", because the sources count those who emigrated or marched, not a population.
- The map's key now reads "Gold glow: places Islam had reached (n)", with "Brighter where the sources count more Muslims", and it is shown on phones too.

### Letters and delegations

`map_arcs.csv` holds one row per letter or delegation. While its event is on screen the map draws a curve between Madinah and the other end, coloured by what the source says came of it (gold: accepted Islam; dashed: did not; green: honoured the letter or made peace), and the event card lists each one with the source's own words.

- **The nine letters (event 106, 7 AH)** all come from Dorar's text for that event, Arabic and English quoted word for word: Caesar, Chosroes, the Negus, al-Muqawqis, the kings of Oman, Hawdhah of al-Yamamah, al-Mundhir of al-Bahrayn, al-Harith al-Ghassani and al-Harith al-Himyari. Where the source names a king but not his city, the line ends at the region's name on the map and `ملاحظة` says so. Caesar's end is Iliya (Jerusalem), from Sahih al-Bukhari 7.
- **The delegations** come from the chapters of Sahih al-Bukhari's Book of Military Expeditions and from Dorar: the people of Yemen (al-Bukhari 4386) and Banu Hanifah with Musaylimah (4373, with 4375 for al-Yamamah) are shown with the Year of Delegations (event 135), and each note says the hadith gives no year. The Christians of Najran come from Dorar event 141 (10 AH), with al-Bukhari 4380.
- **Left out on purpose:** Banu Tamim, because the hadith does not say where they came from; Abd al-Qays, because their hadith places them before the Conquest, while Mudar still stood between them and Madinah; Daws and the Ash'aris, who came at Khaybar (the Ash'aris already have their own route).
- Tests check that every Dorar quote is in the event's text and that each hadith links to its sunnah.com page.

### Quran quotations in English

The English reasons (`وجه_الارتباط_EN`) quote the Quran in Arabic between ﴿ ﴾. In English the app now shows each quotation in **Sahih International's translation, copied word for word from Quranpedia** (the translation Quranpedia shows by default), followed by its reference, e.g. *(Quran 74:1)*, which links to that ayah on Quranpedia. The Arabic stays in the link's tooltip. Nothing is translated by the team or by machine.

- Each quotation was matched to its ayah against the reference in `مرجع_الآيات`. All 66 matched exactly one ayah.
- A quotation that is part of an ayah shows the translation of the **whole ayah**, and the note under the reason says so. There is one exception: where a reason quotes two parts of one ayah and its point depends on the part (ASB-030 «غَيْرُ أُولِي الضَّرَرِ», ASB-031), `Translation_EN` holds the matching words of the same translation and `Ayah_EN` holds the full ayah. A test checks that the part is word for word inside the ayah.
- Footnote numbers from Quranpedia, such as [1788], are removed; the words are unchanged.

### Search, place cards and distances

- **Search** (the بحث / Search button, or `/` or Ctrl/⌘+K): events, people, places and verses together. It ignores diacritics, finds places by their earlier names (يثرب finds al-Madinah), and matches English spellings that differ only in vowels (Medina finds al-Madinah). Choosing an event or verse goes to it in the story; a person or place opens its card.
- **Place cards** (tap a place's name in an event card, or a place in search):
  - the place's name now and its name at the time, with the note on why;
  - when Islam reached it, with the source's words;
  - the counts of Muslims there from `islam_growth.csv`, each marked as a lower bound;
  - every event there, each a link to that event.
- **Distances** are computed from the map's own coordinates (great-circle, rounded) and always called approximate:
  - each journey on its event card, e.g. "about 870 km along an approximate route" (the Isra' line is symbolic, so it gives the straight distance between the two mosques);
  - each walk stop, how far it is from the start out of the whole route;
  - each letter, its straight-line distance from Madinah.

  No travel times are shown, since the sources rarely give them.

### Revelation marks on the timeline

A small green diamond above a timeline tick marks an event that the sources tie verses to, the same verses the event card lists under "Verses linked to this event" (آيات متصلة بهذا الحدث). It is solid when a hadith names the event (`مباشر`, `بعد الحدث`) and hollow when the place is only suggested (`موضع مقترح`).

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

## English in files 1, 3, 6 and 7

The `_EN` columns hold the English the app shows. There are two kinds, and they are never mixed:

- **Quoted word for word from the source:** `نص_الحديث_EN` (sunnah.com's English, with its page in `رابط_نص_الحديث_EN`) and `الشاهد_من_المصدر_EN` (Dorar's English site). `…` marks skipped text.
- **Translated from the Arabic and checked against it pair by pair:** the explanations, synopses, facts, dates and labels. Quran quotations stay in Arabic inside the English (`﴿…﴾`); a test checks they match the Arabic exactly.

`مصدر_الترجمة_EN` says which applies to each row. Where a cell has no English, the app shows the Arabic with "No English translation yet". `السورة_EN` gives the surah names in English (from quran.com's transliteration, in the glossary style).

## English glossary (`glossary.csv`)

One approved English spelling per recurring term, with the spellings not to use. It applies to English the team writes: the `_EN` columns and the app's interface text. Word-for-word quotes keep their source's spelling (Dorar writes "Aboo Bakr", sunnah.com writes "Gabriel"). The rule for names: no apostrophe at the start of a name (Umar, Ali, Abd al-Muttalib), kept inside one (Sa'd, Ka'b, Mas'ud). `app/src/data/glossary.test.ts` fails if a spelling to avoid appears.

## Open items

| Item | Owner |
|---|---|
| Approve the reviewed rows (files 1 and 6), and check the hadith gradings in the 32 TAF rows. All 223 hadith numbers were checked against the hadith texts (file 8) | Hassan |
| Check the approximate coordinates and the 17 inferred locations | Hassan |
| Review the 10 suggested timeline positions (ASB-041 and ASB-049 were moved here: their hadith do not name the event) | Hassan |
| Decide whether the 11 pre-prophethood events are a prologue or are removed, and update the deck's scope line to match | Team |
| Flag events resting on disputed reports (e.g. Dorar events 58 and 61: Asma' bint Marwan, Abu 'Afak), and decide how to frame sensitive events for a beginner audience | Hassan |
| Fetch the Quran text and an approved English translation by `مرجع_الآيات` | Omar / Elyas |
| English versions of titles, summaries and labels (the glossary is in `glossary.csv`) | Omar + Hassan |
| Short card summaries and a "who took part" field for events | Omar + Hassan |
| Split `النص` into source-tagged chunks for retrieval, and write the slide-7 test question set | Omar |

**A note on removed data.** ASB "Yasin and the decayed bone" (original row 12) was removed. It isn't in Bukhari or Muslim; it's reported by al-Hakim from Ibn Abbas. Add it back only with its real source and grading.
"# IslamthonDataandstuff" 
