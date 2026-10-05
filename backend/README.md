# Bidayah backend: "Ask the map" (RAG)

Answers questions about the sirah and the Quran's occasions of revelation **only from approved sources**, cites
them, moves the map to the event, and refuses fatwa / personal / unsourced questions. The frontend (`../app`)
calls it at `POST /api/ask` and falls back to its in-browser answer when the backend is not running.

```
question -> router (LLM: language, type, Arabic + English search rewrites; fatwa/personal/off-topic refused here)
         -> hybrid search: bge-m3 dense + BM25, fused (RRF), over the question and its rewrites -> 30 candidates
         -> bge-reranker-v2-m3 re-scores them; fused with the hybrid ranking (RRF, reranker x2) -> 10 passages
         -> answer (LLM): only from the numbered passages, every sentence cited, else "insufficient"
         -> checks: answered + >=1 valid citation, else the fixed "no source" message
         -> API: plain text + source links + the Dorar event the answer rests on most (`pipeline/mapevents.py`) with a map pin
```

## Run it

```sh
cd backend
python -m venv .venv && .venv/Scripts/activate        # Linux/macOS: source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cu128   # GPU build for your CUDA (or /cpu)
pip install -r requirements.txt
cp .env.example .env                                   # put OPENAI_API_KEY in it
python -m uvicorn server:app --port 8000               # first start: downloads models, embeds the corpus
```

Then run the frontend (`cd ../app && npm ci && npm run dev`): the dev server forwards `/api` to port 8000.

- `GET /api/health` -> `{"ok": true, "chunks": 2905, "llm": "gpt-6-luna", "reranker": true}`
- `POST /api/ask` `{"question": "متى توفي الرسول", "locale": "ar"}` ->
  `{"status": "answered", "kind": "event", "text": "...", "sources": [{"label": "الدرر السنية: ...", "url": "https://dorar.net/history/event/145"}], "event": 145}`
  - `kind`: `event` / `verse` / `person` (by the first cited source), `refusal` (fatwa, personal), `none`
    (no source, off topic, unclear). The answer is written in `locale`.
- Live demo deployment (Modal, below). Docker for any other host (CPU, from the repo root): `docker build -f backend/Dockerfile -t bidayah-api .` then
  `docker run -p 8000:8000 --env-file backend/.env bidayah-api`. A static frontend host then needs
  `VITE_ASK_API=https://<api-host>/api/ask` at build time, and the API `BIDAYAH_CORS=https://<frontend-host>`.

Speed: ~4 s per answer (2 LLM calls) on an RTX 5070; the GPU part (search + rerank) is ~0.3 s. CPU-only adds a
few seconds per question. Memory: ~3 GB for the two models.

## Deploy (live demo): Modal + Vercel

The backend runs on [Modal](https://modal.com) (serverless GPU, T4): it **scales to zero** when idle, so it costs
nothing while nobody visits, and Modal's free Starter plan ($30/month credit) covers the demo (~$0.70 per GPU
hour, a 10-minute visit ~ $0.15). `max_containers=1` caps the spend. The trade-off is a **cold start**: after
~5 idle minutes the first request waits ~20-60 s while the container loads the models (baked into the image).
The frontend pings `/api/health` when the page opens, so the backend usually wakes while the visitor reads the
start page.

```sh
pip install modal && modal token new          # once, opens the browser to log in
modal secret create bidayah-openai OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-6-luna OPENAI_ROUTER_MODEL=gpt-6-luna
cd backend && modal deploy modal_app.py       # first deploy ~10 min: installs, downloads models, embeds corpus
# -> https://<workspace>--bidayah-api-serve.modal.run   (check: <url>/api/health)
```

Frontend on [Vercel](https://vercel.com) (Hobby, free): import the GitHub repo (the root `vercel.json` builds
`app/`), add the environment variable `VITE_ASK_API=https://<workspace>--bidayah-api-serve.modal.run/api/ask`,
deploy. Optional: restrict the API to the site with `BIDAYAH_CORS=https://<site>.vercel.app` in the Modal secret
(default `*`). Set a monthly spending limit on the OpenAI key, since the link is public.

## Folders

```
backend/
  server.py        FastAPI: /api/ask (the frontend's Answer shape), /api/health
  modal_app.py     Modal deployment (image with models + index, T4, scale to zero)
  pipeline/        corpus.py + textnorm.py (load chunks, Arabic normalisation), embedders.py (bge-m3, cache in
                   data/index), bm25.py, retriever.py (hybrid, RRF), reranker.py, prompts.py (router, answer rules,
                   fixed refusals), llm.py (OpenAI or Gemini), rag.py (the assistant)
  data/chunks/     the indexed corpus (2,905 chunks, JSONL) + report.json (counts per source)
  data/index/      corpus embeddings (bge-m3, 12 MB, committed; rebuilt automatically if the chunks change)
```

This repo holds only what the live demo runs. The corpus was built, reviewed and evaluated with a development
toolkit kept outside the repo (team working copy `rag/`): source texts, per-source chunkers, content review
sheets, the 60-question test set, evaluation scripts and all result files, and a Streamlit test UI. Everything
below documents that work for the technical report. If one of this repo's CSVs used by the backend changes
(`1_related_surahs.csv`, `3_links_surahs_sirah.csv`, `2_sirah_events.csv`, `6_sahaba.csv`,
`7_sahaba_references.csv`), rebuild `data/chunks` with the toolkit (`chunking/build_all.py`) and commit it.

## Methodology

### Sources (2,905 chunks)

| Source | Chunks | Notes |
|---|---|---|
| Sahih al-Bukhari (Shamela 1681) | 1,579 | books: Bad' al-Wahy, Manaqib, Fada'il al-Sahaba, Manaqib al-Ansar, Maghazi, Tafsir, Fada'il al-Quran; Fu'ad Abd al-Baqi numbering |
| al-Raheeq al-Makhtum (Shamela 9820) | 602 | chapter hierarchy from Shamela's TOC; weak reports redacted (see below) |
| Dorar sirah events | 371 | 142 events, Arabic + English; place and map pin from `../2_sirah_events.csv` |
| al-Wahidi, Asbab al-Nuzul (Shamela 11314) | 161 | only sahih/hasan narrations with connected chains (836 excluded) |
| Verse records (`../1_related_surahs.csv` + `../3_links_surahs_sirah.csv`) | 94 | the cards' records: 68 ASB (Sahihayn numbers), 26 TAF (Dorar Tafsir Encyclopedia); 60 move the map (direct / after-event links) |
| People (`../6_sahaba.csv` + `../7_sahaba_references.csv`) | 98 | Arabic cited summary + every fact with its verbatim source quote |

Headers are bilingual (English titles, surah and people names) so English questions find Arabic sources.

### Content rules

- **Wahidi**: indexed only if the editor (al-Humaydan) grades the narration sahih/hasan (or "أخرجه البخاري/مسلم"),
  the chain is connected (no mursal, no report quoted straight from a Successor/mufassir), and the verdict names no
  defect. Everything else is in `data/excluded/` and never indexed; `data/review/wahidi_review.csv` overrides.
- **Raheeq / Dorar** (narrative, no per-report grading): removals in `data/review/redactions.csv`
  (`from_text = *` drops a chunk). Currently: al-Zuhri's "فيما بلغنا" report about the mountain (raheeq_0070,
  and its quotation in dorar_en_13) and Ibn Ishaq's mursal version (raheeq_0069, contradicts Bukhari 3).
- **People**: the English summaries / facts in the CSVs are unofficial wording, so only the Arabic summary and
  the verbatim quotes are indexed; English names and aliases are in the header for search.
- **Bukhari**: only numbered hadiths are indexed; every Bukhari number cited by Wahidi and the verse records exists
  in the book (toolkit `data/review/bukhari_refs_check.csv`; 22 rows marked `check` for a human look).
- Excluded and review data live in the toolkit: `data/excluded/wahidi_excluded.jsonl` (836 Wahidi narrations
  never indexed, for audit), `data/review/wahidi_review.csv` (keep/drop per narration), `redactions.csv`.

### Chunking

- Dorar: 1 event = 1 unit (split > 350 words at paragraph/sentence ends), Arabic + English, header = title, AH
  date, place; `event_key = dorar:<n>` links every chunk to the map.
- al-Raheeq: 1 section = 1 unit with its full chapter path from Shamela's table of contents; footnotes kept.
- Bukhari: 1 numbered hadith = 1 unit; header = kitab > bab; the isnad is kept for display but not embedded.
- Wahidi: 1 narration = 1 unit, with the editor's grade and takhrij.
- Verse records / people: 1 record / person = 1 unit (see Sources).
- Every header is bilingual so English questions reach Arabic-only sources.

### Evaluation (toolkit `eval/`)

60 questions (30 Arabic / 30 English): event 22, tafsir 14, companion 8, fact 4, **no_source 6** (unanswerable or
not-established premise), **out_of_scope 6** (fatwa / personal). Gold = rules (Dorar event, Raheeq section,
Bukhari bab/number, verse record id, Wahidi surah:ayah).

Retrieval (48 answerable questions; hit@5 = a gold passage in the top 5, MRR = rank of the first one):

| Setup | hit@5 | recall@10 | MRR |
|---|---|---|---|
| bge-m3 hybrid + Arabic rewrite | 1.00 | 0.63 | 0.96 |
| + bge-reranker-v2-m3 only | 0.98 | 0.67 | 0.90 |
| **+ reranker fused with hybrid (x2)** (used) | 0.98 | 0.67 | 0.93 |
| Qwen3-Embedding-4B hybrid + Arabic | 1.00 | 0.68 | 0.95 |
| e5-large-instruct hybrid + Arabic | 1.00 | 0.61 | 0.92 |
| BM25 only | 0.88 | 0.44 | 0.78 |

bge-m3 was chosen (best MRR, ~1 GB GPU). The reranker was added because hybrid search alone missed passages
worded differently from the question (e.g. "متى توفي الرسول" vs the event title "وفاة": rank 16 -> 4).

Answers (`eval_answers.py --judge --runs 2`, gpt-6-luna, reasoning effort low, final corpus of this repo):

| Measure | Result |
|---|---|
| answered_ok: answerable question answered with a correct source | **97.9%** (47/48)* |
| refusal_ok: unanswerable / not-established premise -> "no source" | **100%** (6/6) |
| refusal_ok: fatwa / personal -> referred to scholars | **100%** (6/6) |
| wrong refusals | 2.1% (1: q03, "why did the Prophet ﷺ migrate", retrieval miss) |
| faithful (LLM judge) | 74.5% |
| consistent (2 runs, same status + citations) | 56.7% |
| latency | 5.3 s mean, 11.2 s p90 |

\* The script reports 91.7%: 3 companion questions (q33, q39, q40) cite the new people records, which the test
set's gold rules predate; checked by hand, all three cite the right person (SAH-001, SAH-039, SAH-007).

How it improved (same test set):

| Step | answered_ok | no_source refusals | faithful |
|---|---|---|---|
| Hybrid search, 8 passages | 91.7 | 83.3 | 65.2 (judge without headers) |
| Judge sees passage headers (dates, places) | 95.8 | 83.3 | 85.4 |
| + reranker, 10 passages, weak "mountain" reports removed | 97.9 | 100 | 74.5 |
| + data package records and people (this repo) | 97.9* | 100 | 74.5 |

Known limits / next steps: faithfulness (the model paraphrases beyond the passage; tighten the prompt or raise
reasoning effort), consistency (no temperature control on gpt-6-luna), q03 retrieval, a harder test set (the
current one is saturated at hit@5 ~ 1.0), and a review pass over al-Raheeq / Dorar for other weak reports.

`faithful` is judged by the same LLM (every claim in the cited passages); it is noisy and many flags are
paraphrase nitpicks, so check failures by hand. gpt-6-luna accepts no `temperature=0`, so two runs can cite
different passages (`consistent`).


## Progress (2026-10-06)

**Live (Modal):** the backend of `bidaya-v11` at 9b05862 (follow-up questions, map-event choice, prompt rules 1-9).
The two newer prompt commits (7495238 and the rule 10 below) are **not deployed yet**: see "Before the next deploy".

### Harder test sets (toolkit `exp/`, run in parallel: 50 questions x 2 runs in ~4 min)

- **50 hard questions** in 9 groups (multi-event, disputed facts, similar names, verses, why/how, false premises,
  follow-ups, refuse/redirect, messy language). A question passes when it cites a correct passage AND an LLM judge finds
  the group's key point (e.g. "gives both 13 and 10 years", "says the two Abu Sufyans are different men"). Follow-ups
  are asked inside the conversation, as the site does. Every rubric fact comes from a corpus passage (ids noted).
- **15 premise questions**: 7 contradicted by the sources (must be corrected), 4 the sources are silent on (must be
  refused, never denied), 4 true premises (must NOT be corrected: the over-correction guard).

| Prompt (deployed corpus, 2,905 chunks) | 50 questions | Faithful | Contradicted corrected | Silent refused | True premises kept |
|---|---|---|---|---|---|
| Live prompt (rules 1-9) | 87/100 | 66% | 6/14 | 8/8 | 7/8 |
| + rule 10 with safeguards | 87/100 | 79% | 9/14 | 8/8 | 7/8 |
| + 7495238 (rule 1 tweak, rule 11) + rule 10 with safeguards (= this commit) | 83/100 | 73% | 11/14 | 8/8 | 7/8 |

**Rule 10** (false premises): correct a premise only when a passage states the opposite, in one neutral cited
sentence, then answer; if the sources are merely silent, never say it did not happen; never correct wording, never say
the user is wrong, never correct a premise the sources support. It replaces 7495238's shorter rule 10, which had none
of these safeguards. Example: "لماذا خسر المسلمون في غزوة بدر؟" -> "لم يخسر المسلمون في غزوة بدر؛ بل حققوا فيها نصرًا كبيرًا…".

**More Bukhari (not adopted):** adding al-Jihad wa al-Siyar, al-Shurut, al-Hajj, Fard al-Khumus, al-Jizya and the
hadiths our records cite (+716 hadiths, corpus 3,633) gave 85/100 vs 87/100 with either prompt, a lower rubric score,
and with the live prompt far more refusals of contradicted premises (1/14). Kept in `exp/plus` for a narrower retry
(only the ~45 cited hadiths).

### Before the next deploy

1. **Rule 1 tweak in 7495238** ("insufficient only when the passages say nothing relevant") makes the model answer
   "Was the Prophet's ﷺ marriage to Aisha moral by today's standards?" with facts (2/2 runs) instead of referring it
   (refused 2/2 without the tweak). Decide: keep the tweak and route moral-judgment questions to a refusal in the
   router, or revert the tweak. Re-run the two test sets, then `cd backend && modal deploy modal_app.py`.
2. Still failing in every version: "years between the two migrations" (an interval to compute), Aisha's age without
   the consummation age, the year-8 list without Mu'tah and Taif, "married Aisha before Khadijah" not corrected,
   Arabic in Latin letters ("shu sar b ghazwat badr?") refused in about half the runs.
3. The LLM judge is strict on wording (e.g. "the 10th year of prophethood" vs "3 years before the Hijra"): read the
   failures before trusting small differences.
