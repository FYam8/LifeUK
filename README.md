# LifeUK

Life in the UK study app built around the learning-flow principles of `FYam8/english-vocab` (Waseda Vocabulary Coach), with LifeUK-specific question data.

## Design rule

- Reuse the Waseda learning pattern: Today/Resume, progress, retry, review scheduling, four-correct mastery, export/import.
- Keep LifeUK content in JSON under `data/`.
- Keep question rendering data-driven through `type`, `correct_option_ids`, and `required_selection_count`.
- Single choice, true/false, and multiple choice use the same renderer and grader. Multiple choice only changes selection cardinality.
- Progress uses the separate `lifeuk_*` storage namespace and never touches Waseda vocabulary history.
- LifeUK-only behavior should remain minimal; future exams should normally be added as data only.

## Data

Exam 1–4 contain 96 questions in total. Source wording is retained from the user-supplied exam text. Answer keys are inferred from the supplied explanations and are marked as not independently verified in the JSON.

## Deployment

Static GitHub Pages app from the repository root.