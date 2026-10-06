# Error log: what went wrong, why, and how it was fixed

Every fault found in Bidaya's answers, content and interface during testing and review, with its cause, its fix and
the commit that made it. "Checked" means the fix was seen working in the repeat run of the 50 hard questions on
6 October 2026 (`rerun-2026-10-06.json`, both runs); open items are known limits, also listed in the evaluation README.

## The assistant's answers

| # | Problem (how it was found) | Cause | Fix | Commit | Status |
|---|---|---|---|---|---|
| 1 | The Companion honorific was given to Abdullah ibn Ubayy (36-question run, 5 Oct) | The answer rules did not limit the honorific | The honorific is used for Companions only | `0a3eb0a` | Checked: q15, "he was not a Companion", no honorific |
| 2 | Arabic answers said "the passages" or used English words ("لكن passages تذكر") (36-question run) | The model echoed the prompt's own words | Answer rule: no mention of passages, no English words in Arabic | `0a3eb0a` | Checked: none in the repeat run's Arabic answers (the only Latin text is the fatwa body's web address) |
| 3 | English answers showed Arabic Dorar titles (9 of 17) and the same event twice (7 of 17) | An Arabic Dorar passage was cited as is | Arabic Dorar passages are shown with the event's English title and English page, one link per event | `5cc8f61`, `0a3eb0a` | Checked: no repeated event in English answers |
| 4 | al-Wahidi sources read "Surah 111:None" | Two entries cover a whole passage, with no verse number | The label leaves out the missing number | `5cc8f61` | Checked: no "None" in any source label |
| 5 | The Arabic honorific appeared inside English sentences | The model copied it from the Arabic sources | English answers get "(may Allah be pleased with him/her/them)" after the model answers (`test_honorific.py`) | `5cc8f61`, `7495238` | Fixed; one repeat answer (q50) had a stray character next to it (open) |
| 6 | Follow-up questions ("ومن قادها؟") were not understood (2 of 2, 36-question run) | Each question was sent alone | The page sends the last turns of the conversation; the backend rewrites a follow-up as a full question (`test_followup.py`) | `0a3eb0a` | Checked: q35 to q39 answered in both runs |
| 7 | "When did Mohammed migrate to Medina?" was refused (50-question run) | No exact day is given, so the model judged the passages insufficient | "Not found" only when the passages say nothing relevant | `7495238` | Checked: q49 answered in both runs |
| 8 | Questions on a false premise ("who killed Abu Lahab at Badr?") got "not found" | The rules had no case for a premise the sources contradict | A premise is corrected only when a passage states the opposite, in one neutral cited sentence; silence is never treated as proof | `7495238`, `1ab8342` | Checked: q29 and q32 corrected in both runs |
| 9 | The Banu Qaynuqa answer ("granted amnesty") was first graded as false | Grading error: it is the wording of the cited Dorar text («فمنَّ على بني قينقاع») | Grade corrected; the answer is incomplete (it leaves out their expulsion), not false | `613a76b` | Closed |

## Open (known limits)

| # | Problem | Status |
|---|---|---|
| 10 | Arithmetic across two events: q3 (years between the two migrations) said "about nine years" where the dates it quotes give about eight, and was declined in the other run | Open; documented |
| 11 | Two people with similar names (q13, the two Abu Sufyans): answered in one run, declined in the other | Open |
| 12 | "من هي زينب؟" asks the user to say which Zaynab instead of naming each one | Acceptable; open as an improvement |
| 13 | The wording changes between runs (the model has no temperature setting); the facts stay the same (section 4 of the evaluation README) | Documented |
| 14 | In English answers, al-Raheeq al-Makhtum's section titles stay in Arabic | The book exists in Arabic only; open |

## Content (found in the content review)

| # | Problem | Fix | Where |
|---|---|---|---|
| 15 | Two hadith numbers did not match their texts | Removed | `data/8_hadith_verification.csv` (rows marked "خطأ – حُذف"; 220 of 223 match, 1 narrator field corrected) |
| 16 | ASB-003 cited Muslim 1748a (the sword narration) | Now 1748c, the story of Sa'd's mother | `346bdd6` |
| 17 | ASB-008 claimed a certain reason for revelation, though Muslim's narrator was unsure | The claim was removed | `346bdd6` |
| 18 | ASB-041 and ASB-049 claimed their hadith names the event; it does not | Both are now estimated positions | `346bdd6` |
| 19 | Islam years of five people (Uthman ibn Talhah, Zaynab, the Negus, Heraclius, al-Muqawqis) were taken from the wrong event | Corrected | `346bdd6` |
| 20 | 22 verse records had no time in any project source (ASB-016 was a hadith on the same theme, not a reason for revelation) | Removed | `6e9141c` |
| 21 | ASB-035 (Bi'r Ma'unah) is an abrogated recitation, not a verse in the Mushaf | Removed | `data/README.md` |
| 22 | Weak reports in the sources the assistant searches | Known weak reports in al-Raheeq redacted; 836 al-Wahidi narrations without a sahih/hasan grading and connected chain excluded | `backend/README.md`, Sources |

## Interface

| # | Problem | Fix | Commit |
|---|---|---|---|
| 23 | Some answers about an event did not move the map, or moved it to the wrong event | The map goes to the event the answer rests on most | `5efb4ee` |
| 24 | A cancelled question's late reply could still move the map or open a person's card; "Ali ibn Abi Talib's wife" opened Ali's card; the phone sheet's back bar covered a note; English Dorar links appeared twice | Questions are numbered and late replies dropped; the full name before "'s" is read; layout fixes; one link per event | `0a3eb0a` |
