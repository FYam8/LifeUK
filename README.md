# LifeUK

Life in the UK practice app. **Exam 1–19: 456 questions (24 per exam)**. Exams 18 and 19 are targeted revision sets based on weak questions and selected prior exams.

**Content audit (17 October 2026):** 456 questions screened and 35 outdated or misleading records corrected, including Welsh Parliament 2026 reforms, jury age, National Citizen Service closure, electoral registration, National Insurance applications and banknotes. See [2026 content audit](docs/currentness-audit-2026-10-17.md). Revised questions receive new IDs to avoid treating old history as answers to changed questions. Stored learning progress and all 19 exams remain available.

## Learning and progress

- Each Exam, Review, and Mistakes-only session is a finite deduplicated pass. Incorrect answers are never reinserted into the active queue.
- Every Exam card shows **Latest accuracy**: correct latest answers / questions with a known latest answer. Unanswered questions are excluded. This updates after any mode. It is not lifetime accuracy.
- **Last completed exam** separately records the most recent full normal Exam session. A partial or mistakes-only session never overwrites it. Old complete-session results were not recorded and are not invented.
- **Ever Wrong Random 24** selects 24 distinct questions randomly from lifetime mistakes, even when the last answer is correct. Fewer than 24 are shown only when fewer qualify. It supports Resume and does not change the normal Exam score.
- **Mistakes only** exists for each Exam and across all Exams. Only the most recent incorrect answers qualify. A correct retry removes the question. Known equivalent variants use the most recent known result. Exact repeats are grouped in mixed sessions.
- The previous engine’s streak determines the latest result only where possible. Unknown old results are not inferred. Original counters are retained.
- Check and Next share a fixed bottom-right slot on mobile, including landscape, with safe-area padding.
- `session-core.js` owns queue rules, receipt restoration, recent accuracy and mistakes filtering. `app.js` is the canonical UI; `app-v17.js` upgrades cached old HTML.
- The existing `lifeuk_state_v1` snapshot now atomically stores progress and the active session; `lifeuk_active_session_v1` is a compatibility mirror. Export/Import remains schemaVersion 1 with additive fields. Other apps’ storage is untouched.

## Verification

Release key: `20261017-content-audit-1`. The historical source-audit snapshot preserves original import hashes, while the current question files intentionally contain verified corrections. Exam 18 new items were curated separately; the John Logie Baird London–Glasgow date is 1932 in the Life in the UK study guide.

Run `node --test tests/session.test.cjs` (34 tests). Browser regression: `QA_ROUND=1 python tests/browser_smoke.py`, then `QA_ROUND=2 python tests/browser_smoke.py` using Python Playwright 1.57.0 and Chromium. CI uses routed HTTP with native browser localStorage. Local `QA_OFFLINE=1` uses isolated synthetic fetch/storage when navigation is unavailable, and is explicitly labelled as such in reports.

Updated regression tests cover all 456 exam records at 1440px and 390px, error-only sessions, latest accuracy, completed results, reload/Home/Resume, partial three-choice selections, duplicate Check/Next events, legacy migration, Export/Reset/Import, and fixed controls at 320px, 390px and 844px landscape. Pass 1 answers every normal question incorrectly; pass 2 correctly. A validated main commit is deployed to GitHub Pages.
