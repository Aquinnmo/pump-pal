# Timber Design Language

Source of truth for how Timber looks, moves, and speaks.

**Precedence.** Unlike [`data-model/README.md`](./data-model/README.md), this
doc does *not* describe the code as it is. It describes the target. New code and
modified code use these values. [Known drift](#appendix-known-drift) is the
acknowledged gap between the two — fix drift in files you are already touching,
and do not open a refactor PR to chase it. If you deliberately depart from this
spec, change the spec in the same PR and say why.

Everything here follows from [`purpose.md`](./purpose.md). Read that first.

## The principle

**The UI is instrumentation, not decoration.**

Timber is read one-handed, mid-set, with a barbell waiting, in bad gym lighting,
by someone who is out of breath. Numbers have to be scannable and stable, targets
have to be thumb-sized, and nothing may cost a tap it doesn't earn.

That's the direct design consequence of the purpose doc: friction is the enemy of
ingestion, and a decorative element that costs a glance is friction. When a
choice is between expressive and legible, legible wins in the tool zone —
without exception.

## Off-limits: generic AI-generated design

**Timber must look authored, not generated.**

There is a house style that LLMs and template galleries converge on — violet
gradients, glass cards, sparkle icons, three equal feature tiles, "Elevate your
fitness journey." It is instantly recognizable, and recognizing it is the
problem: it tells the user nobody decided anything. An app that handles their
training history has to look like a person made choices about it.

This is not a matter of taste. It is the same argument as
[the principle](#the-principle) — decorative surface competes with the numbers,
and generic decoration doesn't even buy personality in exchange.

Every pattern below is **strictly off-limits by default**. Not discouraged.
Off-limits, with an [escalation path](#if-one-is-requested) when someone
genuinely wants one.

The Home "Up Next" hero is the worked example. It went through a decorative
gradient, then an internal glow, then a "true" glow, then a pass to make the Log
actions "feel intentionally product-designed rather than generically generated"
which stripped the gradient and glow layers and the oversized icon wells — and
it ended up **flat**: `app/(tabs)/index.tsx` today contains no shadow, no
elevation, and no gradient. Several rounds of decoration to arrive back at
nothing. That is the cost this list exists to avoid paying twice.

### Surface and color

| Off-limits | Instead |
| --- | --- |
| Violet/indigo→blue "cosmic" gradients; any multi-hue gradient as decoration | Flat `#1c1c1c` on `#0f0f0f`. Timber has one accent and it is red |
| Glassmorphism — frosted/blurred translucent cards, `BlurView` as style | Solid surface + 1px `#2a2a2a` border ([depth](#spacing-radius-depth)) |
| Decorative gradient blobs, orbs, ambient glow layers behind content | Nothing behind content. The background is one flat color |
| Neon glow on arbitrary elements; accent-colored drop shadows as default | Four sanctioned shadows total, listed in [depth](#spacing-radius-depth) |
| Animated gradient borders, shimmer sweeps, "aurora" effects | Static borders |
| Pure black `#000` + saturated neon, the "cyberpunk dashboard" look | `#0f0f0f` and one red |
| Gradient-filled or `background-clip` text | Solid `#fff`, weight for emphasis |

### Layout

| Off-limits | Instead |
| --- | --- |
| The marketing triptych — centered hero, then three equal icon-title-body cards | Real hierarchy. One primary action, supporting actions visibly subordinate — `app/(tabs)/index.tsx` is the reference |
| Bento grids of stat tiles where the stats weren't chosen for a reason | Show a number because the user needs it. Every metric earns its place |
| Oversized rounded-square icon wells at the top of every card | Explicitly removed once already in bead `pump-pal-pga`. Don't reintroduce them |
| Pill-shaped everything; radius 24+ on cards | The [four radii](#spacing-radius-depth) |
| Progress rings on unbounded metrics | A ring implies a target. No target, no ring |
| Badges and chips on text that isn't a status | Plain text |
| Fake depth — stacked translucent cards, floating layers | One surface level per context |

### Iconography and motion

| Off-limits | Instead |
| --- | --- |
| **Sparkles/✨/wand as the AI affordance** | Say what it does: "Balance Workout with AI". Words, not a magic glyph. See [drift](#appendix-known-drift) — this is currently in the tree |
| Emoji as UI iconography in the tool zone | Ionicons, the app's existing set |
| Typewriter/streaming text reveal for text that isn't streaming | Render it |
| Confetti, celebration bursts, or haptic fanfare on routine actions | Reserved for TPC, which exists to be emotional |
| Spring-bounce on everything; springs as decoration | The [motion spec](#motion) |
| Skeleton shimmer as a default loading state | Timber's loaders speak — "Racking your last session" ([voice](#copy-voice)) |

### Copy

| Off-limits | Instead |
| --- | --- |
| "Elevate/Unlock/Transform/Supercharge your fitness journey" | Say the thing. "Log the work" |
| "Seamlessly", "effortlessly", "powerful", "intuitive", "cutting-edge" | Adjectives that describe features, or none |
| Triadic taglines — "Fast, simple, powerful" | One clause that means something |
| "Your AI-powered fitness companion" | Timber logs workouts and finds patterns in them |
| Exclamation marks in the tool zone; "Great job!" style praise | Neutral statements of fact ([voice](#copy-voice)) |
| Feature copy written *about* the user's journey rather than *to* them | Second person, present tense, concrete |

### If one is requested

When a request — from the user, a ticket, or your own instinct — calls for
something on this list:

1. **Do not silently comply.** Shipping it because it was asked for is how the
   list gets defeated.
2. **Do not silently refuse or quietly substitute** something else. Swapping in
   your own idea without saying so is worse; the person never learns their
   request was a problem.
3. **Stop before writing the code.** Flag it explicitly: name the pattern, say
   it is on this list, and say what it costs.
4. **Interrupt with alternatives.** Offer two or three concrete options that
   serve the *underlying goal* — "make Up Next feel important", "show this is
   AI" — without the trope. Agents: use `AskUserQuestion` so it is a real
   blocking choice, not a paragraph the reader skims past.
5. **Only implement the pattern if it is explicitly chosen** after the
   alternatives were seen. Silence, "sure", or "whatever you think" is not a
   choice — it means pick a non-trope option.
6. **If it is chosen, record it.** Add it to
   [sanctioned exceptions](#sanctioned-exceptions) or file a bead. A deliberate
   exception is fine. An undocumented one becomes precedent, and precedent is
   how a codebase drifts back to generic.

The goal is not to prevent these patterns absolutely. It is to make sure no one
ever arrives at one *by default*.

### Sanctioned exceptions

Deliberate, chosen, and narrow. Each one is a decision someone made, not a
pattern to extend.

- **TPC's fire animation** (`app/(tabs)/pushup-challenge.tsx`) — extravagant on
  purpose; the feature's job is emotional payoff, not information. Includes its
  🔥/💔 notification emoji.
- **The arrival-zone gradient** (`components/timber-auth-shell.tsx:20`) — a
  narrow warm-to-black wash, not decoration; it is the [zone](#two-zones) marker.
- **Scroll-edge fade gradients** — functional affordance signalling more content,
  not ornament.

## Two zones

Timber runs two palettes on purpose. The logo is the key to both:
`components/timber-logo.tsx:10-15` defines `GROUND #111111`, `BARK #4A3324`,
`SAPWOOD #6E4A30`, `FACE #C9A567`, and `RING`/`PITH #E54242` — and every one of
those appears in the app.

| | **Arrival** | **Tool** |
| --- | --- | --- |
| Where | `app/(auth)/*`, `app/set-split.tsx`, `components/timber-auth-shell.tsx`, logo and app icon | everything after login |
| Job | say what this is and who made it | get out of the way |
| Surfaces | warm — gradient `['#18120f', '#0f0f0f', '#0f0f0f']` (`components/timber-auth-shell.tsx:20`), card `rgba(20, 19, 18, 0.94)`, field `#181716` |  neutral — see [color](#color) |
| Signature color | gold `#c9a567` (the log face) | none; the accent carries it |
| Borders | bark `#4a3324` | `#2a2a2a` |
| Body text | `#aaa39a`, placeholder `#9f9a92` | `#888`, placeholder `#666` |
| Type | may go big — 38 / 700 / -1.2 tracking (`components/timber-auth-shell.tsx:163`) | the [scale](#typography), no exceptions |

**Rules:**

- Gold, bark, and sapwood **never** appear in the tool zone. They mark arrival.
- The accent `#e54242` appears in **both** — it is the log's pith ring, and it is
  the thread that makes the two zones one product.
- The arrival zone is a small, fixed set of screens. It does not grow. A new
  screen is a tool screen unless it is part of first-run.

## Color

One value per role. The "Replaces" column is what dies on contact.

| Role | Value | Replaces |
| --- | --- | --- |
| screen background | `#0f0f0f` | — |
| chrome (tab bar, logo ground) | `#111111` | — |
| card / raised surface | `#1c1c1c` | `#1a1a1a` `#181818` `#1a1818` `#171717` |
| sunken (inputs, wells) | `#151515` | `#141414`, `#1c1c1c`-used-as-input |
| border / outline | `#2a2a2a` | `#2e2e2e` `#292929` `#242424` `#222` `#3a3a3a` `#262626` `#332626` |
| divider (chrome, header rule) | `#1e1e1e` | — |
| text primary | `#fff` | — |
| text secondary | `#888` | `#898989` `#858585` `#999` `#aaa` |
| text tertiary / placeholder | `#666` | `#555` `#777` `#ccc` |
| text disabled | `#444` | — |
| accent / primary action | `#e54242` | `#E54242` (normalize case) |
| success | `#4ade80` | `#81cf9b` `#73c69a` |
| error | `#f87171` | `#ff6b6b` `#b00020` |
| info | `#60a5fa` | `#4ea8de` |

Three surfaces, one border, four text weights. That is the whole tool palette.
If you need a fifth grey, you need a different layout.

### Destructive actions are not color-coded

Timber has **one** action color. Destructive intent is carried by **copy and
placement**, not hue.

The app already does this and it works: `app/active-workout.tsx:790` labels the
escape hatch "Keep Going" and `:734` labels the commit "Finish Anyway". The user
reads what will happen; they don't decode a color.

This also follows from [the anti-guilt non-goal](./purpose.md#non-goals) — an
alarm-red confirm dialog every time you discard a workout is the app scolding
you. So `#b00020` and `#ff6b6b` are drift, not a destructive palette. A
destructive confirm button uses the accent like any other affirmative button.

Reserve `error #f87171` for **things that went wrong** — failed writes, invalid
input, network errors — not for things the user chose to do.

### Tinted surfaces are a recipe, not new tokens

To tint a card semantically, composite the status color over the card surface at
low alpha. Do not mint a hex.

```
surface:  #1c1c1c
tint:     rgba(74, 222, 128, 0.08)   // success at 8%
border:   rgba(74, 222, 128, 0.24)   // same hue, ~24%
text:     #fff / #888 as normal, or the status color for the icon
```

This replaces the six bespoke greens in
`components/muscle-insight-cards.tsx:383-407` and the bespoke blue duplicated
across `app/modal.tsx:1055-1068` and `app/active-workout.tsx:920-933`.

## Typography

**No custom fonts.** Timber uses the platform system font — there is no
`useFonts` call and no `fontFamily` anywhere in `app/` or `components/`. This is
a deliberate default, not an oversight: the system font is the most legible
option on each platform at small sizes, ships at zero cost, and respects the
user's accessibility text settings. Don't add one.

`constants/theme.ts` exports a `Fonts` object. Nothing uses it. See
[drift](#appendix-known-drift).

| Step | Size | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| display | 24 | 700 | -0.5 | hero numbers, screen-defining values |
| section | 18 | 700 | — | card and section titles |
| header | 17 | 700 | — | screen header bars |
| body | 15 | 500–600 | — | default for everything |
| secondary | 14 | 500 | — | subtitles, captions, helper text |
| eyebrow | 12 | 700 | +1.4, uppercase | small labels above a value |

Six steps. `13`, `16`, `20`, `21`, `28` and up are drift in the tool zone; the
arrival zone keeps its 38 display as the one documented exception.

There is no `400`/normal weight in Timber — body text is 500 or heavier. On dark
backgrounds at these sizes, 400 reads thin and washed out.

**Line height by ratio, not literal.** 1.4× for body and below, 1.2× for display
and section. This replaces roughly fifteen ad-hoc `lineHeight` values.

### Numerals

**Every metric uses `fontVariant: ['tabular-nums']`.** Not just timers — every
weight, rep count, volume total, 1RM, streak day, and set number.

Proportional digits change width as they change value, so a scanning eye has to
re-find the number every time it ticks, and columns of sets don't align. That is
precisely the failure the [principle](#the-principle) forbids.

The three strength-metric styles in `app/(tabs)/analytics.tsx` and the rest timer
at `app/(tabs)/index.tsx:397` already do this and are the reference. Everywhere
else showing a number should.

## Spacing, radius, depth

**Spacing — 4-point scale:** `4 · 8 · 12 · 16 · 20 · 24 · 32`. Nothing else.
Odd values (3, 5, 7, 9, 11) and off-grid 14/18 are drift.

- Screen gutter: **20** horizontal.
- Control padding: **12** vertical / **16** horizontal.
- Card padding: **16**.

**Radius — four values:**

| Value | Use |
| --- | --- |
| `10` | fields, option rows, small inputs |
| `14` | cards, buttons |
| `20` | bottom-sheet top corners |
| `999` | pills, grabbers, circular elements |

`12`, `16`, `18`, `22`, `24`, `28`, `100` are drift. Add
`borderCurve: 'continuous'` on cards — `app/(tabs)/index.tsx:316,404` is the
reference.

**Depth comes from surface and a 1px border, not shadow.** This is already true:
the entire app contains four shadows. Cards separate from the background by
being `#1c1c1c` on `#0f0f0f` with a `#2a2a2a` hairline. That reads cleanly on
dark and costs nothing to render.

The two sanctioned shadows:

- **Arrival-zone primary button** — accent glow: color `#e54242`, offset
  `{0, 5}`, opacity `0.22`, radius `12`, elevation `4`
  (`components/timber-auth-shell.tsx:62-66`).
- **Toast** — `#000`, offset `{0, 4}`, opacity `0.3`, radius `8`, elevation `5`
  (`components/ui/toast.tsx:99-103`).

Everything else is flat. Tool-zone buttons do not glow — including the Up Next
hero, which went through several rounds of gradient and glow treatments before
landing flat. `app/(tabs)/index.tsx` currently contains no shadow, elevation, or
gradient at all. Keep it that way.

## Component canon

Each pattern has one correct implementation already in the tree. Copy from the
named file rather than re-deriving.

**Card** — `components/workout-card.tsx:236-243`
`#1c1c1c` · border 1px `#2a2a2a` · radius 14 · padding 16.

**Bottom sheet** — `components/ui/dropdown.tsx:190-216`
Full-screen overlay `rgba(0,0,0,0.6)` → content `#1c1c1c` with
`borderTopLeft/RightRadius: 20`, `maxHeight: '70%'`, `paddingBottom: 30` →
grabber pill 36×4 `#444` at the top → `navBarFill` strip behind the Android nav
bar. Pan-to-dismiss via `react-native-gesture-handler`.
This logic is currently triplicated verbatim (see
[drift](#appendix-known-drift)); until it's extracted, copy from `dropdown.tsx`.

**Confirm dialog** — `app/active-workout.tsx:770-800`
Centered card `#1c1c1c`, radius 14, padding 24. Title states the question
("Discard workout?"), body states the consequence in plain language, two
buttons. **The copy carries the intent** — the escape button says what you keep
("Keep Going"), the commit button says what it does ("Finish Anyway"). Neither is
color-coded. Never write a dialog whose buttons are just "Cancel" / "OK".

**Primary button** — `components/timber-auth-shell.tsx:57-72`
`#e54242` · radius 14 · `paddingVertical: 16` · text `#fff` / 800 / 16 ·
`activeOpacity={0.8}`.

**Input** — `#151515` · border 1px `#2a2a2a` · radius 10 · padding 12v/16h ·
text 15 · `placeholderTextColor` `#666`.

**Header row** — `paddingHorizontal: 20`, `borderBottomWidth: 1` `#1e1e1e`,
title at header step (17/700). Reference: `app/settings-account.tsx:248,257`.

**Option row** — `minHeight: 52`, padding 16v/14h, bottom border `#2a2a2a`.
Selected state: accent-tinted background per the
[tint recipe](#tinted-surfaces-are-a-recipe-not-new-tokens), radius 10, accent
text.

**Empty state** — title, one line of subtitle, **and the action that fixes it**.
The "no workouts yet" state in `app/(tabs)/analytics.tsx` is the model: "Your progress starts with one
workout" / "Log a session and Timber will turn it into records, trends, and
muscle insights." / `[Start a workout]`.

An empty state that only reports emptiness is a dead end. It should sell the
next action and explain the payoff.

## Motion

Motion clarifies where things came from. It is never ornamental in the tool zone.

| Element | Spec |
| --- | --- |
| Sheet in | `withSpring({ damping: 20, stiffness: 300 })` |
| Sheet out | `withTiming({ duration: 200 })` |
| Micro transition | `FadeIn.duration(180)` / `FadeOut.duration(160)` |
| Toast | 300 in and out, 3000 visible |
| Press feedback | `activeOpacity={0.8}` |

**`useReducedMotion()` is required** on anything that loops or runs longer than
~400ms. `components/ui/workout-prefill-loader.tsx:89-95` is the reference
implementation — it falls back to a static progress value rather than removing
the element. Currently it is the *only* component that honors it.

**Reanimated for new work.** The legacy RN `Animated` API in
`app/(tabs)/pushup-challenge.tsx` and `components/ui/toast.tsx` is grandfathered.
Don't copy it, and note the pushup screen runs `useNativeDriver: false`
throughout.

**TPC is the exception that proves the rule.** Its ~2.9s fire animation — burn
front, embers, 30-particle flame burst, shockwave — is deliberately extravagant
because that feature's entire job is *emotional payoff for a habit*, not
information density. That license does not extend to any screen that displays
data.

### Haptics

Currently one call site: `components/haptic-tab.tsx:12`, on tab press.

**Spec — these should fire and currently don't:**

| Event | Feedback |
| --- | --- |
| Set marked complete | `ImpactFeedbackStyle.Light` |
| Workout finished | `NotificationFeedbackType.Success` |
| Destructive confirm | `ImpactFeedbackStyle.Medium` |

This directly serves ingestion: confirming a set by feel means not looking at the
phone between reps. Unimplemented — see [drift](#appendix-known-drift).

## Copy voice

The voice is the most distinctive thing Timber has. Five rules.

**1. Wood and logging wordplay lives in the arrival zone only.**
"Timber is named for logging your workouts", "Put down some roots", "Set your
training roots", "Each completed session adds another ring to your workout
history", "Pick up your log". Charming on the way in; friction when you're
looking for a number mid-set. **Never in the tool zone.**

**2. Loading states speak gym, not software.**
"Racking your last session" (`components/ui/workout-prefill-loader.tsx:144`),
"Crunching your numbers", "Reading your training pattern". Never "Loading…".

**3. Optionality is stated out loud.**
"Planning is optional — queue up a workout whenever it's useful."
"Choose the split you use most. You can still plan or log any workout you want."
"Queue a workout when it helps, or start one when you are ready."
This is the [anti-guilt non-goal](./purpose.md#non-goals) made literal. Timber
never implies the user is behind, missing something, or failing.

**4. Confirmations are choices, not warnings.**
The escape button names what you keep ("Keep Going"), not "Cancel". The body
states the consequence factually: "This will move the workout back to your
planned queue." No exclamation marks, no "Are you sure?", no scare language.

**5. Meters are shown, never hidden.**
`Balance Workout with AI (2 left)` → `No AI uses left today`.
`Refresh · 3 left` → `Daily limit reached`. If the product is rationing
something, the user sees the count. Silent failure and vague "try again later"
are not acceptable.

**Errors** are terse and never blame the user: "Invalid credentials. Please try
again.", "Network error. Please check your connection."
(`utils/firebase-errors.ts`). AI failures degrade quietly with a retry
affordance — "Could not load AI insights. Tap to retry."

## Accessibility

`app/(tabs)/analytics.tsx` sets the bar and the rest of the app should meet it —
see the Strength summary and chart labels, which speak the full metric as a
sentence:

- **Every metric block carries an `accessibilityLabel`** that speaks the numbers
  as a sentence, rather than leaving a screen reader to read a bare "182".
- **Values are `selectable`** so they can be copied out.
- **Reduced motion** is honored per the [motion](#motion) rule.
- **Touch targets ≥ 44pt.** The option-row `minHeight: 52` is the reference; the
  ±28px rep steppers in `components/workout/exercise-card.tsx` are the known
  violation.
- **Contrast**: `#888` on `#1c1c1c` is the minimum for secondary text. `#666` is
  for placeholder and disabled only — never for content the user must read.

---

## Appendix: known drift

Current as of 2026-08-02. The tree has **143 distinct hex literals** across
`app/` and `components/`, and zero design tokens. This appendix exists so the
gap is visible, not so anyone goes and fixes it all at once.

### Structural

- **`constants/theme.ts` is dead.** Untouched Expo scaffolding — the header
  comment at `:1-4` is still the template's. Its `Colors` map is a light/dark
  scheme no screen consumes; its `Fonts` export has zero references. The app is
  hardcoded dark-only. Likewise `components/themed-text.tsx`,
  `components/themed-view.tsx`, `hooks/use-theme-color.ts`: referenced only by
  other unused scaffolding (`components/parallax-scroll-view.tsx`,
  `components/ui/collapsible.tsx`, `components/hello-wave.tsx`,
  `components/external-link.tsx`).
- **No token file.** Every value in this doc is currently a literal at each call
  site.

### Verbatim duplication

- **Bottom-sheet logic ×3** — `components/ui/dropdown.tsx:60-85`,
  `components/workout-card.tsx:61-75`, `components/ui/exercise-picker.tsx:89-134`
  are the same 200ms/damping-20/stiffness-300 implementation, with the
  `modalContent` + grabber + `navBarFill` style blocks copy-pasted and only
  `maxHeight` differing.
- **AI panel styles ×2** — `app/modal.tsx:1055-1068` and
  `app/active-workout.tsx:920-933`.
- **Split-name AI generation + AsyncStorage cache ×3** —
  `app/(tabs)/index.tsx:70-84`, `app/active-workout.tsx:247-268`,
  `app/planned-workouts.tsx:85-99`.

### Color

Files by hex-literal count: `pushup-challenge.tsx` 57, `analytics.tsx` 56,
`modal.tsx` 51, `active-workout.tsx` 42, `planned-workouts.tsx` 41,
`muscle-insight-cards.tsx` 36, `settings-injuries.tsx` 36,
`settings-account.tsx` 34.

- **Card surface, 6 values** — canonical `#1c1c1c` (32 uses) plus `#1a1a1a`
  (`pushup-challenge.tsx:41`), `#1a1818` (`index.tsx:320`), `#181818`
  (`index.tsx:407`), `#141414` (`exercise-card.tsx:196`,
  `plate-calculator.tsx:243`), `#171717` (`analytics.tsx` chart canvas).
- **Border, 8 values** — `#2a2a2a` (43) plus `#2e2e2e` (16), `#292929`,
  `#242424`, `#222`, `#3a3a3a`, `#262626`, `#332626`.
- **Secondary text, 5+ values** — `#888` (36), `#555` (20), `#666` (14), `#aaa`
  (9), `#999` (7), plus `#898989` / `#858585` / `#c9c9c9` unique to
  `app/(tabs)/index.tsx`.
- **Placeholder, 4 values** — `#9f9a92` (arrival, correct), `#555`
  (`active-workout.tsx`), `#777` (`settings-injuries.tsx`), `#666`
  (`exercise-picker.tsx`).
- **Error red, 6 values** — `#f87171`, `#ff6b6b` (`exercise-card.tsx:185`),
  `#b00020` (`settings-account.tsx:325`), plus tinted variants.
- **Success green, 5 unrelated values** — `#4ade80` (`toast.tsx:56`), `#81cf9b`
  (`analytics.tsx` strength-positive value), `#73c69a`, `#dff4e8`, `#9eb9aa`
  (`muscle-insight-cards.tsx`).
- **Case inconsistency** — `#e54242` (102) vs `#E54242` in
  `components/timber-logo.tsx:14-15`; same for the gold, bark, and sapwood
  constants.
- **Not drift:** the ~25 oranges and yellows in
  `app/(tabs)/pushup-challenge.tsx:298-346` are a fire gradient ramp. Ramps are
  data, not tokens. Leave them.

### Typography and spacing

- **`fontSize` in use:** 15 (52), 14 (44), 16 (27), 13 (23), 18 (16), 17 (15),
  12 (14), 24 (8), then a long tail — 11, 19, 20, 21, 22, 25, 28, 29, 30, 32, 38.
  The 16s and 13s are the biggest cleanup.
- **`borderRadius` in use:** 10 (38), 14 (30), 18 (10), 16 (7), 6 (6), 12 (5),
  4 (4), 22 (4), 2 (4), 8 (3), 28 (2), 20 (2), plus singletons including 13, 19,
  24, 42, 100, 999.
- **Off-grid spacing** — `paddingHorizontal: 14` (20 uses) is the most common
  violation of the 4-point scale.
- **`tabular-nums`** applied in only 4 places
  (three strength-metric styles in `analytics.tsx`, plus `index.tsx:397`); every other numeral in the
  app is proportional.

### Motion and a11y

- **`useReducedMotion()`** honored in exactly one component
  (`workout-prefill-loader.tsx:89`). Sheets, toast, and every pushup-screen
  animation ignore it.
- **Haptics** unimplemented outside tab presses — see the
  [haptics spec](#haptics).
- **Two animation runtimes** coexist; `pushup-challenge.tsx` runs
  `useNativeDriver: false` throughout.

### Generic-design tropes present in the tree

Measured against [off-limits](#off-limits-generic-ai-generated-design). The tree
is mostly clean — no glassmorphism, no blur, no decorative blobs, and the
oversized icon wells were already removed in bead `pump-pal-pga`. Two live
instances:

- **Sparkle icon as the AI affordance** — `app/modal.tsx:747` and
  `app/active-workout.tsx:660` render `name="sparkles"` on the AI suggestion
  button. The adjacent label already says "Balance Workout with AI", so the glyph
  adds nothing but the signature. Replace with a neutral icon or none.
- **Emoji in streak notification titles** — 🔥 and 💔 in
  `utils/streak-notification.native.ts`. Covered by the TPC
  [exception](#sanctioned-exceptions); listed here so it is a decision on the
  record rather than an oversight.

### Copy

- **`app/(tabs)/workouts.tsx:151`** — "Tap + to log your first workout" refers to
  a `+` button that no longer exists.
- **Quote style** — `app/modal.tsx`, `app/active-workout.tsx`,
  `app/(tabs)/analytics.tsx`, `components/muscle-insight-cards.tsx` use
  double-quoted style values; the rest of the tree uses single quotes.
