# Why Timber Exists

Source of truth for product intent. This doc is the *why*. When a proposed
change can't be justified against it, the change is wrong, not the doc — and if
the product direction genuinely shifts, change this doc first, in the same PR.

For how it should look and sound, see
[`design-language.md`](./design-language.md). For what the data looks like, see
[`data-model/README.md`](./data-model/README.md).

## Thesis

**Timber does everything it can to ingest your workout data accurately with
minimal interaction and effort, then turns that data into insights you would not
otherwise realize — so you can avoid injury and know your real strengths and
weaknesses.**

Two halves. Ingestion is the constraint; insight is the payoff. Friction is the
enemy of both. Every feature should be traceable to one half or the other.

## Simple by design

Timber is not trying to explain everything to the user. It should make the most
useful insights as accessible and simple as possible, without burying them in
detail or asking the user to do interpretive work the product can do for them.
The simpler the app, the better.

## Why "painless" is load-bearing, not a nicety

This is the section that makes the rest of the doc decidable. There are two
failure modes, and they pull in opposite directions:

1. **Too much friction → no data.** A logging app that is annoying mid-set gets
   abandoned mid-workout, then mid-week. No data means no insight, and the whole
   second half of the thesis evaporates. Most fitness apps die here.
2. **Too little rigor → wrong data.** Fast entry that guesses, autofills without
   confirmation, or records sets the user never performed produces a *confidently
   wrong* insight. "Your quads are undertrained" is actively harmful advice when
   it's an artifact of sloppy capture. This is worse than showing nothing.

Every ingestion decision trades these two. The pattern Timber uses to escape the
tradeoff is: **pre-fill aggressively, but require an explicit confirmation that
costs one tap.** The autofill removes the typing; the per-set checkbox
(`app/active-workout.tsx:455`, which strips uncompleted sets before write)
guarantees nothing enters the dataset the user didn't affirm. Cheap to log,
still true.

When you can't have both, **fidelity wins**. It is always acceptable to show
less insight; it is never acceptable to show a wrong one.

## How the product already embodies this

| Feature | Serves |
| --- | --- |
| Autofill from the last time you did this exercise *on this same split day*, falling back to any day (`hooks/use-draft-exercises.ts:44`) | ingestion |
| Cascade an edit forward through following sets, stopping at the first deliberately different one so pyramids and drop sets survive (`hooks/use-draft-exercises.ts:21`) | ingestion |
| Exercise picker offers recents-for-this-day before it offers search (`components/ui/exercise-picker.tsx:319`) | ingestion |
| Per-set completion checkbox; unchecked sets are dropped at finish (`app/active-workout.tsx:452-456`) | fidelity |
| 800ms debounced autosave to the platform repository (SQLite + transactional outbox on native; API on web) (`app/active-workout.tsx`) | never lose data |
| Live Android notification + Pixel Live Update showing current exercise and running totals (`utils/workout-notification.android.ts`, `modules/live-update-notification/`) | log without opening the app |
| Plate calculator solves minimum plates per side (`utils/plate-math.ts`) | removes gym math |
| Muscle attribution joins catalog `exerciseId`/`variationId` exactly — explicitly no name guessing (`utils/muscle-analysis.ts:51`) | fidelity |
| Ongoing injuries auto-stamped onto every finished workout (`app/active-workout.tsx:458`, `utils/injuries.ts:21`) | insight with zero extra data entry |
| TPC: one swipe, zero fields (`app/(tabs)/pushup-challenge.tsx`) | habit, at zero ingestion cost |

Read that table as a specification, not a changelog. New features should be able
to add a row.

## What the insights are for

Two jobs, both named in the thesis:

**Injury prevention.** Over- and under-trained muscle groups over a 30-day
window, and workout suggestions that know about your active injuries — their
affected muscles, severity, avoid-list, and notes
(`utils/workout-suggestions.ts:102-119`).

**Strengths and weaknesses.** Estimated 1RM trend per exercise (Epley), personal
records, best sets, and volume distribution across muscle groups.

### The deterministic-first rule

This is the standard for every AI feature, present and future.
`utils/muscle-analysis.ts` computes the volume math **in code** — effective sets
weighted 1.0 primary / 0.5 secondary, normalized per week, with 0.0 rows emitted
for untrained muscles specifically to surface neglect — and hands the model a
finished table to interpret. The model does not count, does not join, and does
not infer which muscles an exercise trains.

The reason is the fidelity rule above: an LLM guessing that "RDL" hits hamstrings
is an insight built on a guess. A catalog join is an insight built on data. When
adding an AI feature, compute everything computable first, then let the model do
only the part that genuinely requires judgment.

Domain knowledge that shapes interpretation belongs in the prompt as an explicit
constraint, not as vibes — see `utils/muscle-analysis.ts:194` ("roughly 10–20
effective sets per muscle per week") and the split-boundary rules at
`utils/workout-suggestions.ts:232-241`.

## Non-goals

- **Not a social app.** No feed, no followers, no comparison to other users. The
  only comparison that matters is you against your own history.
- **Not a nag.** The copy is deliberately low-pressure: "Planning is optional —
  queue up a workout whenever it's useful"
  (`app/planned-workouts.tsx:194`), "when you are ready"
  (`app/(auth)/welcome.tsx:47`). Guilt is a retention tactic that costs
  fidelity — a user who feels judged logs less honestly. TPC's streak pressure
  is the single deliberate exception, and it is quarantined to a feature with no
  data entry.
- **Not a medical advisor.** Hard constraint, already in the prompt at
  `utils/workout-suggestions.ts:240`:
  > Do not diagnose, prescribe treatment, or claim that any exercise is medically
  > cleared. If no reasonable safe additions remain, return an empty array.

  Injury data exists to *avoid* aggravating movements, never to treat them. Any
  new AI surface that touches injury data inherits this constraint verbatim.
- **Not a general fitness tracker.** No steps, sleep, macros, or weight. Timber
  is about what you lifted.

## Decision rules

A change should do at least one of:

1. **Reduce interactions per logged set.** Fewer taps, less typing, less
   navigation between the barbell and the phone.
2. **Increase fidelity** of what gets captured, or prevent a category of wrong
   data from entering.
3. **Turn data the user already gave us into an insight they couldn't produce
   themselves.**

If it does none of those, it needs a stated reason to exist.

Two corollaries worth applying by reflex:

- **A new input field is a cost, and it must be paid for.** Adding something the
  user has to fill in is only justified by a specific insight that field
  unlocks. Name the insight in the PR. A field nothing consumes is pure friction.
- **Anything derivable should be derived.** If the app can compute it from what
  it already has — split day, muscle groups, plate math, next workout, injury
  attribution — it must not ask.

## Known tensions

Stated openly rather than pretending the product is coherent. These are real and
current.

- **AI rationing fights the thesis.** `TEMPORARY_AI_DAILY_LIMIT = 3`
  (`constants/ai-config.ts:11`) is a cost lever that directly rations the insight
  half of the product. It is named "temporary" for a reason. The UI at least
  exposes the meter honestly rather than failing silently
  (`Balance Workout with AI (2 left)`).
- **The biggest ingestion gap is RPE.** `types/workout.ts:6-18` declares `rpe`,
  and `computeMuscleVolume` already *consumes* it and feeds it to the model as a
  recovery signal (`utils/muscle-analysis.ts:104-105`, prompt at `:194`). **No
  UI writes it.** The fatigue model runs permanently blind on a signal it was
  designed around. Same story, lower stakes, for `distance`, `calories`, and
  per-set `notes`. Closing this is the single highest-leverage ingestion work
  available — and per the "new field is a cost" rule, RPE is the rare case where
  the insight is already built and waiting.
- **Catalog fidelity degrades over time.** User-submitted exercises land as
  `pending_review` docs with no triage process (bead `pump-pal-sya`). Every
  unpromoted exercise is a set that can't be joined to a muscle group, which
  silently weakens exactly the analysis in the section above.

## A note on the name

The product is **Timber** (`app.json:3`). The repo is `pump-pal`, the Firebase
project is `pumppal-c9199`, and AsyncStorage keys are prefixed `pumppal_`. This
is intentional inertia, not an oversight — renaming the Firestore project or the
storage keys is a migration with no user-visible benefit. Don't "fix" it.

The name is a pun and the copy leans on it: Timber is named for *logging* your
workouts. See the voice section in
[`design-language.md`](./design-language.md#copy-voice).
