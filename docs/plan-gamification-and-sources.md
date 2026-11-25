# Design & plan: Gamified profile + "Build from anything" sources

Status: proposal · 2026-11-24 · builds on b0a6bdf ("Generate your own")

---

## 0. The constraint that shapes everything

The learning itself happens **outside the app** — the learner pastes our prompt into
Claude / ChatGPT / Gemini. So we can't watch them finish a module. Two consequences:

1. **Completion needs a proof step back in the app.** Otherwise badges are just
   buttons people click, and they mean nothing.
2. **We need persistence.** Today there's no database (JWT sessions, courses are static
   in `lib/courses.ts`, generated courses vanish on refresh). Badges, a library of
   generated courses, and a profile all need storage.

The design below solves (1) with a **"Graduate" proof loop** and (2) with a small DB.

---

## 1. Gamification

### 1.1 The loop

```
 Start course ──► learn in AI chat ──► come back, tick modules ──► submit graduation proof
      │                                     (+XP per module)              │
      │                                                                    ▼
      └──────────── profile grows: badges · XP/level · expertise ◄── AI grades proof
```

Three tiers of completion, so nobody is blocked but real effort is worth more:

| State         | How you get it                                               | Badge look            | XP  |
|---------------|--------------------------------------------------------------|-----------------------|-----|
| **Started**   | Copy the prompt / click "Start"                              | none (shows in "In progress") | 10 |
| **Completed** | Self-report: tick every module in the in-app syllabus        | outlined badge        | 50 + 10/module |
| **Graduated** | Paste your graduation one-pager back → Gemini grades it vs. the course's `graduation` brief + `gate`s | filled badge + ✓, tier **Bronze/Silver/Gold** from the grade | 150 / 200 / 300 |

Why the proof loop works: every course *already* ends in a share-ready one-pager
(`graduation` field). We just add a "Paste it here to graduate" box. The grader returns
`{ pass, tier, feedback, strengths[] }`; a fail gives feedback and lets them retry.
To make it smooth, the course prompts get one extra instruction: *"At the end, output
the one-pager inside a fenced block titled GRADUATION so the learner can copy it."*

### 1.2 Badges

- **Course badge** (one per course). Reuses what each course already has: `icon`
  emoji + `color` → a round Notion-tinted medallion. Tier = ring color. Zero new art.
- **Achievement badges** (meta, rule-based, computed from records):

  | Badge            | Rule                                            |
  |------------------|-------------------------------------------------|
  | 🌱 First Steps   | Graduate 1 course                               |
  | 📚 Bookworm      | Graduate 3 courses built from books             |
  | 🔬 Scholar       | Graduate a course built from a research paper   |
  | 🧩 Synthesizer   | Graduate a course built from 3+ mixed sources   |
  | 🌐 Polymath      | Graduate courses in 3+ expertise areas          |
  | 🥇 Perfectionist | 3 Gold graduations                              |
  | 🔥 On a Roll     | Learning activity 4 weeks in a row (weekly, not daily — kinder) |
  | 🛠️ Course Maker  | Generate 5 courses                              |

  Defined as data in `lib/achievements.ts` (`{ id, icon, title, desc, check(stats) }`)
  so adding one is a one-liner. Locked ones show greyed with progress ("2 / 3").

### 1.3 XP, levels, expertise

- **Level** = f(total XP), gentle curve: level n needs `100 · n^1.5` XP. Titles:
  Curious → Apprentice → Practitioner → Specialist → Expert → Polymath.
- **Areas of expertise** come from the course `category` (already exists: "Business",
  "AI & Engineering", "AI & World"…). For generated courses Gemini already returns a
  free-text `category`; we **normalize it to a fixed taxonomy** (~12 areas: Business,
  Finance, Strategy, AI & Engineering, AI & World, Science, Humanities, Design,
  Health, Personal Growth, Tech, Other) by asking Gemini to pick from the enum.
- Each area has its own XP → **area level** (e.g. "Finance · Lv 3"). Profile shows the
  top areas as bars (or a small radar once ≥ 3 areas).

### 1.4 Profile page — `/profile` (own) and `/u/[handle]` (public, opt-in)

```
┌───────────────────────────────────────────────────────────────┐
│ (C)  Cecily            Lv 7 · Specialist   ▓▓▓▓▓▓▓░░ 1,340 XP │
│      12 courses done · 5 graduated · 🔥 6-week streak  [Share]│
├───────────────────────────────────────────────────────────────┤
│ AREAS OF EXPERTISE                                            │
│ Finance        ▓▓▓▓▓▓▓▓░░  Lv 4                               │
│ AI & Eng       ▓▓▓▓▓░░░░░  Lv 3                               │
│ Strategy       ▓▓░░░░░░░░  Lv 1                               │
├───────────────────────────────────────────────────────────────┤
│ BADGE SHELF   [All] [Graduated] [Completed]                   │
│  (🚀)gold  (🤖)silver  (💸)  (♟️)  ( )locked …                 │
├───────────────────────────────────────────────────────────────┤
│ ACHIEVEMENTS  🌱 📚 🔬 ░░ ░░  (2/3 to Polymath)               │
├───────────────────────────────────────────────────────────────┤
│ IN PROGRESS   Startup Mini-MBA  ▓▓▓░░ 3/6 modules  [Continue] │
│ MY LIBRARY    courses you generated (with source-type icons)  │
└───────────────────────────────────────────────────────────────┘
```

Header gets the avatar → link to `/profile` plus a tiny XP/level pill. A toast +
confetti-lite moment when a badge/level unlocks (CSS only, no lib).

---

## 2. "Build from anything" — multi-source input

### 2.1 UX principle: one box, auto-sorted shelf

Users shouldn't have to pick "what kind of thing is this" first. So:

1. **One smart input** ("Paste a link, search a book, or drop a file") + a drop zone.
2. Each thing added becomes a **source card on a "Source shelf"**, auto-detected and
   **grouped by type**. Grouping is what keeps a 10-item mix organized.
3. One **Generate** button with a mode toggle. Shelf is the single place to review,
   remove, or reorder before generating.

```
┌ Build a course ───────────────────────────────────────────────┐
│ [ Paste a link, search a book title, or drop a PDF…   ] [Add] │
│   Try: a YouTube talk · an arXiv paper · "Thinking, Fast…"    │
├ Your sources (6) ─────────────────────────────────────────────┤
│ 📖 Books (2)        Thinking, Fast and Slow — Kahneman   ✕    │
│                     Poor Charlie's Almanack — Munger     ✕    │
│ 🎓 Courses (1)      coursera.org/learn/behavioral-finance ✕   │
│ 📄 Papers & PDFs(1) Prospect Theory (1979).pdf · 31 pp   ✕    │
│ ▶️ Videos (1)       YouTube · "Biases explained" · 42 min ✕   │
│ 🐦 Posts (1)        @naval · thread · 12 tweets          ✕    │
├───────────────────────────────────────────────────────────────┤
│ Make:  (•) One course from all   ( ) A learning path (1/source)│
│ Focus (optional): [ "for investing decisions"            ]    │
│                                          [ Generate course ]  │
└───────────────────────────────────────────────────────────────┘
```

Each card shows status: `resolving… → ✓ ready` / `⚠ couldn't read — we'll use the title
& AI knowledge` (never a dead end).

### 2.2 Source types & how each is read

Fixed set of **6 display groups** (fewer, broader buckets beat one per format):

| Group            | Detected from                                      | How we get content                                                |
|------------------|----------------------------------------------------|-------------------------------------------------------------------|
| 🎓 Courses        | coursera/udemy/edx/etc. or any page that looks like a course | existing `fetchPage` (HTML → text)                         |
| 📖 Books          | typed title/author with no URL, ISBN, Goodreads/Amazon/OpenLibrary link | **Open Library search API** for title/author/cover/subjects → chooser dropdown. Content = model knowledge (we never fetch book text). |
| 📄 Papers & PDFs  | arxiv.org, doi.org, `*.pdf`, uploaded PDF          | arXiv → abstract page + PDF; PDF → send to Gemini as a file part (inline ≤ ~15 MB, else Files API) |
| ▶️ Videos         | youtube.com / youtu.be                             | Gemini accepts YouTube URLs directly as `fileData` — it watches/reads it |
| 🐦 Posts & threads | x.com / twitter.com, threads, linkedin posts      | X oEmbed (`publish.twitter.com/oembed`) for the text; fallback to page fetch |
| 🔗 Articles & web | anything else                                      | existing `fetchPage` (later: Readability-style extraction)        |

Detection lives in one pure function `classifySource(input) → SourceKind` — easy to
unit test. Limits: max 10 sources, PDFs ≤ 20 MB, total text budget per generate
~60k chars (each source gets a fair share; long ones are summarized first).

### 2.3 Generation modes

- **One course from all** (default): a *synthesis* prompt. The syllabus `source` field
  per module already exists → each module is attributed to the shelf item it draws on,
  and the course page shows a "Built from" list with type icons.
- **Learning path**: one course per source (or per book), ordered, sharing a path
  badge. Great for "add my 5 books on negotiation". Path = parent record with child
  courses; graduating all of them unlocks the path badge.

### 2.4 Pipeline (server)

```
client shelf ──addSource()──► resolveSource(kind) ──► ResolvedSource {kind,title,meta,text|fileRef}
                                                           │  (stored, cached by URL hash)
Generate ──generateFromSources(ids, mode, focus)──► build multi-part Gemini request
                                                    (text parts + PDF/YouTube file parts)
                                                           ▼
                                               GeneratedCourse (+ sourceRefs[]) → saved to DB
```

Resolving happens **per source as it's added** (fast feedback on the card, and the
expensive generate call only runs once). PDFs upload through a Route Handler
(`app/api/sources/upload/route.ts`) rather than a Server Action, since actions cap
bodies at 1 MB by default.

---

## 3. Data model (new)

Recommended stack: **Postgres (Neon free tier) + Drizzle ORM** — serverless-friendly,
typed, small. (SQLite/Turso is an equally fine swap.) Auth stays Auth.js/JWT; we key
everything by the session `user.id` (and switch the dev guest to a stable per-browser id).

```
users          id, handle, name, image, public_profile bool, created_at
courses_gen    id, owner_id, slug, json (GeneratedCourse), area, mode, path_id?, created_at
sources        id, owner_id, kind, title, url?, meta json, text_hash, created_at
course_sources course_id, source_id, position
paths          id, owner_id, title, created_at
enrollments    user_id, course_ref ("static:mini-mba" | "gen:<id>"), status
               (started|completed|graduated), tier?, modules_done int[], xp,
               started_at, completed_at, graduated_at
graduations    id, enrollment_id, submission text, grade json, created_at
achievements   user_id, achievement_id, unlocked_at
xp_events      user_id, amount, reason, area, created_at   ← source of truth for XP & streaks
```

Static catalog courses stay in code; they're referenced as `static:<slug>`.
Levels/areas/streaks are **derived** from `xp_events` (no counters to drift).

---

## 4. Build plan (phased, each phase shippable)

**Phase 1 — Persistence foundation** ✅ done (2026-11-24; Phase-1 tables only: `users`, `generated_courses` — later tables land with their phase)
- Add Drizzle + Neon, schema + migrations, `lib/db.ts`.
- Save generated courses → `/courses/g/[id]` page (reuse `GeneratedCourseView`).
- "My Library" list. Guest user gets a stable id.

**Phase 2 — Progress + profile v1**
- `enrollments` + module checkboxes on both course pages; "Start" on copy.
- `xp_events`, levels, area taxonomy (+ Gemini `category` → enum).
- `/profile` with stats, areas, badge shelf, in-progress. Header avatar/XP pill.

**Phase 3 — Graduate proof loop**
- "Graduate" panel on course pages → `gradeGraduationAction` (Gemini, schema'd grade).
- Tiers, filled badges, unlock toast. Add GRADUATION-block instruction to all prompts
  (static ones in `lib/courses.ts` + generation instruction in `lib/generate.ts`).

**Phase 4 — Multi-source shelf (links)**
- `classifySource`, `resolveSource` for course/article/YouTube/X/arXiv.
- New `SourceShelf` component replacing the single URL input in `course-generator.tsx`.
- `generateFromSources` (multi-part Gemini request, synthesis prompt). Keep old URL
  path as the 1-source case.

**Phase 5 — Books + PDFs**
- Open Library search-as-you-type chooser in the smart input.
- PDF upload route + Gemini file parts. Size/page limits + friendly errors.

**Phase 6 — Learning paths + achievements + sharing**
- "Learning path" mode, path records & path badge.
- `lib/achievements.ts` rules + achievements row on profile.
- Public `/u/[handle]` (opt-in toggle) + OG image of the badge shelf for sharing.

Rough size: phases 1–3 are the core gamification (~3 focused sessions); 4–6 the source
expansion (~3 more).

---

## 5. Open decisions (defaults chosen, change if you disagree)

1. **DB**: Neon Postgres + Drizzle (default) vs. Turso/SQLite vs. Supabase.
2. **Is self-reported "Completed" counted** in "courses done"? Default: yes, but
   expertise levels weight Graduated 3×.
3. **Public profiles**: opt-in (default) vs. on by default.
4. **Streaks**: weekly (default, less guilt) vs. daily.
5. **Grading cost**: one Gemini Flash call per graduation attempt; cap at ~5 attempts/day.
