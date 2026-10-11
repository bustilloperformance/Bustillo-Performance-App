# Bustillo Performance — Coaching CRM

CRM y app de entrenamiento para **Bustillo Performance** (José Antonio "Josean"
Bustillo · North Vancouver, BC). Una sola instancia, un solo negocio.

El coach administra clientes, planes, cobros, ejercicios, rutinas, programas 1:1,
check-ins semanales, finanzas y el chat de comunidad. El cliente ve su plan, sigue su
rutina, registra series, sube fotos de progreso y participa en el chat, desde el
teléfono (PWA instalable).

> New to this codebase? Read this file first, then [`ARCHITECTURE.md`](./ARCHITECTURE.md)
> for how the pieces fit together and where to make changes.

---

## Stack

| Layer      | Tech |
|------------|------|
| Frontend   | React 19 + Vite, Tailwind CSS v3, [lucide-react](https://lucide.dev) icons |
| Backend    | [Supabase](https://supabase.com) — Postgres + Row Level Security, Auth, Edge Functions (Deno) |
| Payments   | [Stripe](https://stripe.com) — embedded checkout + payment links, webhook |
| Hosting    | [Vercel](https://vercel.com) — auto-deploy from `main`, served at `app.bustilloperformance.com` |
| PWA        | `manifest.webmanifest` + apple-touch icons → installable "Add to Home Screen" |

There is **no TypeScript** — plain JS/JSX. Lint must stay clean (`npm run lint` → 0 problems).

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill in the two values below
npm run dev                    # http://localhost:5173
```

### Environment (`.env.local`, never committed)

Only two vars, both safe to ship to the browser (Vite exposes only `VITE_`-prefixed vars):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon/publishable key>
```

The **anon key is public by design** — it grants only what Row Level Security allows.
The real protection is RLS on every table (see ARCHITECTURE.md → Security). The
`service_role` key is **never** in the frontend; it lives only in Supabase Edge Functions.

### Scripts

| Command           | What it does |
|-------------------|--------------|
| `npm run dev`     | Vite dev server with hot reload |
| `npm run build`   | Production build → `dist/` (also emits `dist/version.json` for auto-update) |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run lint`    | ESLint — keep this at **0 problems** |

---

## Project layout

```
src/
  main.jsx            App entry — mounts <App/>
  App.jsx             Auth gate → FeedbackProvider → DataProvider → Shell
  theme.js            Brand color palette (C.ink, C.gold, …)
  index.css           Tailwind + global styles

  components/         Reusable UI (Shell nav, Modal, Avatar, timers, providers…)
    DataProvider.jsx      Fetches all tables once, provides the `data` store
    FeedbackProvider.jsx  Toast + confirm dialog UI
    ui.jsx / uiStyles.js  Shared UI components / input style constants

  data/               The data layer (see ARCHITECTURE.md)
    store.jsx             `data` shape, row→camelCase mappers, useData() hook
    <entity>.js           Write operations per table (plans, members, logs, …)

  lib/                Pure helpers — no React
    helpers.js            Dates, weights, 1RM, logged-metrics, formatting
    workoutHelpers.js     Workout sections / circuits / item grouping
    permissions.js        Role → feature-key gating
    auth.js / supabaseClient.js

  features/           One folder per domain (members, plans, workouts, client, studio…)
```

Everything client-facing lives under `features/client/`. Staff screens are the other
`features/*` folders, wired into `components/Shell.jsx`.

---

## Deploy

Push to `main` → Vercel builds and deploys automatically to `app.bustilloperformance.com`.

> **El build FALLA a propósito si faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY`.**
> Sin esa guarda (`requireSupabaseEnv` en `vite.config.js`) el bundle se compila SIN la
> aplicación y Vercel publica una página en blanco con el deploy en verde.

- **Auto-update:** every build stamps a unique `version.json`; the running app polls it
  and silently reloads when a new build ships (no "please refresh" prompts). See
  `useAutoUpdate` in [`src/App.jsx`](./src/App.jsx).
- **Cache headers** live in [`vercel.json`](./vercel.json) (no-cache `index.html` +
  `version.json`, plus HTTPS/security headers). That file is strict JSON and
  Vercel rejects any key outside its schema, so the one non-obvious header is
  explained here instead: `Permissions-Policy` grants **`payment`** and
  **`publickey-credentials-get`** to Stripe's origins. Embedded Checkout is a
  cross-origin iframe, and Link / Apple Pay / Google Pay all run on the Payment
  Request API, which the policy denies to iframes unless named. Drop them and
  the iframe silently renders card fields only — no console error — while a
  hosted Stripe checkout still shows every wallet, which makes it look like a
  Stripe misconfiguration.
- **Commit author** must be the project owner's GitHub account, or Vercel's Hobby plan
  rejects the deploy.

Supabase Edge Functions (in `supabase/functions/`) are deployed separately via the
Supabase Management API / CLI.

---

## Conventions (read before editing)

- **Reads** come from the in-memory store: `const { data } = useData()`.
- **Writes** go through a `data/<entity>.js` function, then call `refresh()` to re-sync.
- DB is snake_case; the app is camelCase. The boundary is the mappers in `store.jsx`.
- Keep functions/components small and named for what they do. Match the surrounding
  file's comment density and style (`// ====` section headers).
- Prefer pure helpers in `lib/` over logic buried in components.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full picture, domain models, and a
step-by-step "how to add a feature".
