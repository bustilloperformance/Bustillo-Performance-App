# Architecture

How Bustillo Performance is put together, and where to make changes. Pair this with the
[`README.md`](./README.md) quick start.

---

## 1. Runtime flow

```
main.jsx
  └─ <App/>                         src/App.jsx
       ├─ auth gate                 Supabase session → login | splash | app
       ├─ useAutoUpdate()           polls /version.json, reloads on new deploy
       └─ <FeedbackProvider>        toast + confirm dialogs (useToast/useConfirm)
            └─ <DataProvider>       fetches every table once → `data` store
                 └─ <Shell/>        role-aware nav + renders the active screen
```

- **`App.jsx`** is the gate. No session → `LoginPage`. Session but profile still
  loading → splash. Otherwise it mounts the providers and `Shell`.
- **`Shell.jsx`** holds the current `view` string and renders the matching screen.
  Two nav sets: `OWNER_NAV` (staff) and `CLIENT_NAV` (clients). Staff with a linked
  member can toggle **Admin ⇄ Client view**.

---

## 2. Data layer (the important part)

The whole app reads from **one in-memory store** and writes through **per-entity modules**.

### Reading — the store

`DataProvider` (in `components/DataProvider.jsx`) calls `fetchAll()` once on mount,
which queries every table in parallel and maps each row from snake_case (DB) to
camelCase (app) using the mappers in `data/store.jsx`. The result is the `data` object:

```js
const { data, loading, error, refresh } = useData();
data.members            // Member[]
data.membershipPlans    // Plan[]
data.workoutLogs        // Log[]
// …one key per table
```

`useData()` is the only way components touch data. There is no per-component fetching.

### Writing — `data/<entity>.js`

Each table has a module of write operations (e.g. `data/plans.js`, `data/logs.js`).
The pattern is always the same:

```js
// 1. a formToRow() that maps the UI form → a DB row (camelCase → snake_case)
// 2. an insert/update/delete against supabase
// 3. the CALLER awaits it, then calls refresh() to re-sync the store
await saveWorkoutLog(entry, member.points);
await refresh();
```

So: **components never call `supabase` directly for writes** — they import a function
from `data/<entity>.js`. Reads never hit the network — they use the store.

### Why this shape

It mirrors the original single-file prototype (one `data` blob + one `update()`),
which kept the migration mechanical and low-risk. Row Level Security does the
per-role filtering server-side, so `fetchAll()` returns everything an owner may see,
or only their own rows for a client — the client code is identical either way.

---

## 3. Auth, roles & permissions

- **Auth** is Supabase Auth (email + password). Sign-up is disabled — the owner
  invites members via the `invite-member` Edge Function (uses `service_role`
  server-side). See `data/members.js` / `data/team.js`.
- **Profiles** carry a `role`. `client` is the baseline client experience; any other
  role is "staff" (matches the DB's `is_staff()`).
- **Permissions** are feature keys (`members`, `plans`, `chat`, …) listed in
  `lib/permissions.js`. `roleCan(role, key, roles)` gates staff nav + actions.
  Owner / a role with `["*"]` can do everything. This is **UI-level** gating —
  the real enforcement is RLS.

---

## 4. Security model

The frontend ships the **public anon key**, so anyone can hit the Supabase REST API
directly. The only thing protecting data is **Row Level Security on every table** —
treat RLS as the real access control, not the UI.

- `service_role` (the master key) is **only** used inside Supabase Edge Functions,
  never in the bundle.
- The Stripe webhook (`supabase/functions/stripe-webhook`) verifies the signature
  before trusting any event.
- HTTP security headers (HSTS, X-Frame-Options, nosniff, referrer, permissions) are
  set in `vercel.json`.
- When adding a table, add its RLS policies at the same time. A table with RLS off is
  world-readable/writable via the anon key.

---

## 5. Domain models worth knowing

These are the concepts a new dev trips over first.

### Workouts & logging
- A **workout** is a list of `items` (JSONB). Items are grouped into **sections**
  (Strength, HIIT, Stretch…) and **circuits** (A/B/C) — see `lib/workoutHelpers.js`.
- **What a client logs is per-exercise**: each exercise defines `logMetrics`, any
  combination of `weight | reps | distance | time` (set in the Exercise Library).
  The logger renders one input per metric; progression can graph each. Helpers:
  `logMetricsOf`, `setMetric` in `lib/helpers.js`.
- **Weight units:** the client enters in `lb`, `kg`, or `BW` (bodyweight), but weight
  is **always stored in pounds** so tracking stays consistent (kg is converted on
  save; BW stores no weight). See `kgToLb` / the log panel.
- **Autosave:** the log panel writes an in-progress draft to `localStorage` so leaving
  mid-workout never loses data; the draft clears on a successful save.
- **Legacy logs:** older logs stored a single `value`; `setMetric()` reads both the
  new explicit fields and the legacy shape, so nothing needs migrating.

### One model: 1-on-1 online
Every client is a 1-on-1 online client with a personal program. The old segment /
class-schedule / booking / point-of-sale features were removed (Oct 2026); their
tables (`segments`, `segment_programs`, `classes`, `reservations`, `products`) are
still in the database, empty, and nothing reads them. `members.segment` and
`membership_plans.mode / sessions_per_week` are written with constant values.

### Community chat
Groups the owner creates, choosing exactly who is in each one (the owner need not
be a member). Tables `chat_groups`, `chat_group_members`, `chat_messages` (0033).
RLS: staff read/moderate everything; a client sees only groups they belong to,
writes only as themselves, deletes only their own. Photos live in the private
`chat` bucket under `<group_id>/` and are served with signed URLs. New messages
arrive through Supabase Realtime (`chat_messages` is in the publication; Realtime
respects RLS). A client cannot read other rows of `members`, so `chat_peers()`
(security definer) returns just id/name/photo of people who share a group with
them. UI: `features/chat/ChatView.jsx` (one screen for staff and client),
data layer `data/chat.js` (not in the store — it subscribes on its own).

### Plans, memberships & the tax engine
- `membership_plans` are the offerings; `memberships` link a member to a plan.
- Pricing is **tax-inclusive** and configurable in-app (see `lib/financeHelpers.js`
  and the taxes table). One-time plans skip recurring billing.

---

## 6. How to add a feature (worked example)

Say you're adding a "Injuries" note per member:

1. **DB:** add the column/table in Supabase + its RLS policies.
2. **Mapper:** in `data/store.jsx`, map the new field (snake_case → camelCase) and, if
   it's a new table, add it to `fetchAll()` and `EMPTY`.
3. **Write op:** add `data/injuries.js` (or extend `data/members.js`) with a
   `formToRow` + insert/update, following the existing pattern.
4. **UI:** build the screen under `features/<domain>/`, read via `useData()`, write via
   your `data/*` function, then `await refresh()`.
5. **Nav + gating (if staff):** add a `view` case in `Shell.jsx`, a nav entry, and a
   permission key in `lib/permissions.js`.
6. **Verify:** `npm run lint` (0 problems) and `npm run build` before committing.

---

## 7. Conventions & gotchas

- **Reads = store, writes = `data/*` + `refresh()`.** Don't fetch in components.
- **Dates are local, not UTC.** Use `todayISO()` / `fmtISO()` / `parseLocalDate()`
  from `lib/helpers.js` — building dates from raw strings caused off-by-one bugs.
- **Provider files stay component-only.** Hooks/constants live in a sibling file
  (`feedback.jsx` vs `FeedbackProvider.jsx`, `store.jsx` vs `DataProvider.jsx`,
  `ui.jsx` vs `uiStyles.js`) so React Fast Refresh stays clean. Keep it that way.
- **No TypeScript**, no test suite yet — `lint` + `build` + manual testing are the
  safety net. Keep lint at zero.
- **Deploys** salen del repo del coach en su propia cuenta de Vercel, y el
  running app auto-updates via `version.json` — no manual cache-busting needed.
- **La base de datos NO se levanta solo con las migraciones numeradas.** En la
  instancia original, `nutrition_plans`, `progress_photos` y los buckets de Storage
  se crearon a mano en el dashboard, y la 0019 revienta sin ellos. Ese hueco lo cierra
  `0018b_nutrition_and_progress_photos.sql`, cuyo DDL se recuperó leyendo el esquema
  de producción. Si agregas tablas, que sea en una migración.
