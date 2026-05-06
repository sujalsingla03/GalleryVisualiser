# Supabase Auth + Saved Spaces + Vercel Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add user auth (Supabase), persistent saved "spaces" (DB-backed metadata; photos stay on device), and deploy the Vite app to Vercel.

**Architecture:** Pure client-side. The Supabase JS SDK runs in the browser and talks directly to Supabase Auth + Postgres via PostgREST. **No serverless functions, no backend code.** Row-Level Security (RLS) policies in Postgres enforce per-user access. Photos remain on the user's device; saved spaces store only metadata + a content hash per photo, so users can reattach the same folder when reloading. Vercel deploys the static Vite build from the GitHub `main` branch.

**Tech Stack:** Supabase (Auth + Postgres), `@supabase/supabase-js` v2, Vercel for hosting. No new heavy deps.

---

## File Structure

```
src/
├── lib/
│   ├── supabase.ts                  # NEW — singleton Supabase client
│   └── photoHash.ts                 # NEW — content-hash a File for re-attachment
├── store/
│   ├── authStore.ts                 # NEW — user, signIn, signUp, signOut, init
│   ├── spaceStore.ts                # NEW — saved spaces list + load/save/delete
│   └── viewStore.ts                 # MODIFIED — add 'auth' and 'spaces-list' views
├── components/
│   ├── AuthGate.tsx                 # NEW — gates the app when no user
│   ├── AuthForm.tsx                 # NEW — email/password + magic-link form
│   ├── SpacesList.tsx               # NEW — "My Spaces" picker screen
│   ├── ReattachScreen.tsx           # NEW — drop folder to match a saved space
│   ├── SaveSpaceModal.tsx           # NEW — name + save current space
│   ├── SpaceHud.tsx                 # MODIFIED — add Save button + sign-out menu
│   └── LandingScreen.tsx            # MODIFIED — link to "My spaces" if logged in
├── App.tsx                          # MODIFIED — view machine includes auth/spaces-list/reattach
├── types/
│   └── space.ts                     # NEW — SavedSpace shape
└── (existing files)
supabase/
└── migrations/
    └── 0001_init.sql                # NEW — schema + RLS policies
.env.example                         # NEW — VITE_SUPABASE_URL + ANON_KEY placeholders
.env                                 # gitignored — actual keys
vercel.json                          # NEW — minimal SPA config (optional)
README.md                            # MODIFIED — setup + deploy instructions
```

---

## Milestone A — Supabase project + schema

### Task A1: Create Supabase project (manual user step)

**Manual:** the user creates a new Supabase project at supabase.com:
1. Go to https://supabase.com/dashboard/projects → "New project"
2. Name: `pinviz`. Region: closest. Strong DB password.
3. Wait ~2 min for provisioning.
4. Settings → API → copy `Project URL` and `anon public` key.

The implementer cannot do this; the plan needs the user to provide these two values before Task B can proceed.

- [ ] **Step 1: Confirm with user that Supabase project is created and provide URL + anon key.**

If user has not done this yet, STOP at this task and report `NEEDS_CONTEXT` with explicit instructions.

---

### Task A2: Schema + RLS migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Write `supabase/migrations/0001_init.sql` with EXACTLY:**

```sql
-- PinViz schema v1
-- Tables: spaces (per-user saved photo arrangements)

create table if not exists public.spaces (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  layout_seed  bigint not null,
  photo_meta   jsonb not null default '[]'::jsonb
  -- photo_meta = [{ name, size, contentHash, aspectRatio, scale, position: {x,y,z} }]
);

create index if not exists spaces_user_id_idx on public.spaces (user_id, created_at desc);

-- Row-Level Security
alter table public.spaces enable row level security;

drop policy if exists "spaces_select_own" on public.spaces;
create policy "spaces_select_own" on public.spaces
  for select using (auth.uid() = user_id);

drop policy if exists "spaces_insert_own" on public.spaces;
create policy "spaces_insert_own" on public.spaces
  for insert with check (auth.uid() = user_id);

drop policy if exists "spaces_update_own" on public.spaces;
create policy "spaces_update_own" on public.spaces
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "spaces_delete_own" on public.spaces;
create policy "spaces_delete_own" on public.spaces
  for delete using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists spaces_set_updated_at on public.spaces;
create trigger spaces_set_updated_at
  before update on public.spaces
  for each row execute procedure public.set_updated_at();
```

- [ ] **Step 2: User applies the migration**

Manual instruction in the report: "Open Supabase dashboard → SQL Editor → New query → paste the contents of `supabase/migrations/0001_init.sql` → Run."

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: supabase schema + RLS"
```

---

### Task A3: Install Supabase JS + env-var template

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Modify: `.gitignore` (ensure `.env` is ignored — Vite's default already does this)

- [ ] **Step 1: Install `@supabase/supabase-js`**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Create `.env.example` with EXACTLY:**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 3: Verify `.env` is in `.gitignore`. Vite's default scaffold ignores `*.local` but not raw `.env`. Add this line to `.gitignore` if missing:**

```
.env
```

- [ ] **Step 4: Tell the user to create their local `.env`**

In the report, include: "Create a `.env` in the project root with your real `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase dashboard → Settings → API."

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: add @supabase/supabase-js + env template"
```

---

## Milestone B — Auth shell

### Task B1: Supabase client singleton

**Files:**
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: Write `src/lib/supabase.ts` with EXACTLY:**

```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env and fill in your Supabase project values.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: supabase client singleton"
```

---

### Task B2: authStore

**Files:**
- Create: `src/store/authStore.ts`

- [ ] **Step 1: Write `src/store/authStore.ts` with EXACTLY:**

```ts
import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: User | null;
  loading: boolean;
  init: () => () => void;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  init: () => {
    // Hydrate the current session from local storage, then subscribe to changes.
    supabase.auth.getSession().then(({ data }) => {
      set({ user: data.session?.user ?? null, loading: false });
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null, loading: false });
    });
    return () => subscription.subscription.unsubscribe();
  },
  signInWithPassword: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  },
  signUpWithPassword: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  },
  signInWithMagicLink: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    return { error: error?.message ?? null };
  },
  signOut: async () => {
    await supabase.auth.signOut();
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/store/authStore.ts
git commit -m "feat: auth store"
```

---

### Task B3: AuthForm component

**Files:**
- Create: `src/components/AuthForm.tsx`

- [ ] **Step 1: Write `src/components/AuthForm.tsx` with EXACTLY:**

```tsx
import { useState } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useAuthStore } from '../store/authStore';

type Mode = 'sign-in' | 'sign-up' | 'magic-link';

export function AuthForm() {
  const signInWithPassword = useAuthStore((s) => s.signInWithPassword);
  const signUpWithPassword = useAuthStore((s) => s.signUpWithPassword);
  const signInWithMagicLink = useAuthStore((s) => s.signInWithMagicLink);

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    let result: { error: string | null };
    if (mode === 'sign-in') result = await signInWithPassword(email, password);
    else if (mode === 'sign-up') result = await signUpWithPassword(email, password);
    else result = await signInWithMagicLink(email);
    setBusy(false);
    if (result.error) setError(result.error);
    else if (mode === 'magic-link') setInfo('Check your email for the magic link.');
    else if (mode === 'sign-up') setInfo('Account created. Check your email if confirmation is required.');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 'var(--font-size-lg)',
    fontFamily: 'inherit',
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-button)',
    color: 'var(--text-primary)',
    marginBottom: 12,
    outline: 'none',
  };

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 16px',
    fontSize: 'var(--font-size-md)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    background: 'var(--color-accent)',
    color: 'var(--text-on-accent)',
    border: 'none',
    borderRadius: 'var(--radius-button)',
    cursor: 'pointer',
    fontWeight: 600,
    opacity: busy ? 0.6 : 1,
  };

  const linkStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 'var(--font-size-md)',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center mb-6">
        <h1
          style={{
            fontSize: 'var(--font-size-hero-medium)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          PinViz
        </h1>
        <p style={{ fontSize: 'var(--font-size-lg)', color: 'var(--text-secondary)' }}>
          {mode === 'sign-in' && 'Sign in to your spaces.'}
          {mode === 'sign-up' && 'Create an account.'}
          {mode === 'magic-link' && 'Sign in with a link.'}
        </p>
      </div>

      <FrostPanel style={{ width: 'min(420px, 90vw)', padding: 28 }}>
        <form onSubmit={onSubmit}>
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={inputStyle}
          />
          {mode !== 'magic-link' && (
            <input
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              style={inputStyle}
            />
          )}
          <button type="submit" disabled={busy} style={buttonStyle}>
            {busy ? '…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send link'}
          </button>

          {error && (
            <div style={{ color: 'var(--color-system-red)', fontSize: 'var(--font-size-md)', marginTop: 12 }}>
              {error}
            </div>
          )}
          {info && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-md)', marginTop: 12 }}>
              {info}
            </div>
          )}

          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            {mode === 'sign-in' && (
              <>
                <button type="button" style={linkStyle} onClick={() => setMode('sign-up')}>
                  Create account
                </button>
                <button type="button" style={linkStyle} onClick={() => setMode('magic-link')}>
                  Magic link
                </button>
              </>
            )}
            {mode === 'sign-up' && (
              <button type="button" style={linkStyle} onClick={() => setMode('sign-in')}>
                ← Sign in instead
              </button>
            )}
            {mode === 'magic-link' && (
              <button type="button" style={linkStyle} onClick={() => setMode('sign-in')}>
                ← Use password
              </button>
            )}
          </div>
        </form>
      </FrostPanel>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AuthForm.tsx
git commit -m "feat: AuthForm (sign-in, sign-up, magic link)"
```

---

### Task B4: AuthGate + auth-init in main.tsx

**Files:**
- Create: `src/components/AuthGate.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write `src/components/AuthGate.tsx` with EXACTLY:**

```tsx
import type { ReactNode } from 'react';
import { useAuthStore } from '../store/authStore';
import { AuthForm } from './AuthForm';

export function AuthGate({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-md)' }}>Loading…</span>
      </div>
    );
  }

  if (!user) return <AuthForm />;
  return <>{children}</>;
}
```

- [ ] **Step 2: Initialize auth in `src/main.tsx`. REPLACE with EXACTLY:**

```tsx
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { useAuthStore } from './store/authStore';

useAuthStore.getState().init();

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 3: Wrap App contents in AuthGate. Modify `src/App.tsx`. REPLACE with EXACTLY:**

```tsx
import { SvgFilters } from './components/SvgFilters';
import { AuthGate } from './components/AuthGate';
import { LandingScreen } from './components/LandingScreen';
import { ProcessingScreen } from './components/ProcessingScreen';
import { SpaceScene } from './components/SpaceScene';
import { SpaceHud } from './components/SpaceHud';
import { PhotoLightbox } from './components/PhotoLightbox';
import { useViewStore } from './store/viewStore';

export default function App() {
  const view = useViewStore((s) => s.view);

  return (
    <>
      <SvgFilters />
      <AuthGate>
        {view === 'landing' && <LandingScreen />}
        {view === 'processing' && <ProcessingScreen />}
        {view === 'space' && (
          <>
            <SpaceScene />
            <SpaceHud />
            <PhotoLightbox />
          </>
        )}
      </AuthGate>
    </>
  );
}
```

- [ ] **Step 4: Verify build (will fail without `.env` — that's expected; the AuthForm shouldn't crash if env vars are present, but `supabase.ts` throws if absent).**

```bash
npm run build
```

If build fails because env vars are missing, that's expected without a real `.env`. Continue. (Vite will replace `import.meta.env.VITE_*` at build time but only with values present in `.env`. Without `.env`, the strings are `undefined` and the throw fires at module-load time. CI will fail similarly. Add the `.env` later before deploying.)

If build fails for any OTHER reason, REPORT BLOCKED.

- [ ] **Step 5: Commit**

```bash
git add src/components/AuthGate.tsx src/main.tsx src/App.tsx
git commit -m "feat: gate app behind AuthGate; init auth on boot"
```

---

## Milestone C — Saved spaces

### Task C1: Photo content hash

**Files:**
- Create: `src/lib/photoHash.ts`

- [ ] **Step 1: Write `src/lib/photoHash.ts` with EXACTLY:**

```ts
// Compute a stable hash for a photo file so it can be re-attached when reloading a saved space.
// We hash the first 64 KB of the file plus its size and name — sufficient to disambiguate
// typical photo libraries without reading the whole file.

const HASH_PREFIX_BYTES = 64 * 1024;

export async function photoContentHash(file: File): Promise<string> {
  const slice = file.slice(0, HASH_PREFIX_BYTES);
  const buf = await slice.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex}-${file.size}-${file.name}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/photoHash.ts
git commit -m "feat: photoContentHash for re-attachment"
```

---

### Task C2: SavedSpace types + spaceStore

**Files:**
- Create: `src/types/space.ts`
- Create: `src/store/spaceStore.ts`

- [ ] **Step 1: Write `src/types/space.ts` with EXACTLY:**

```ts
export interface PhotoMeta {
  name: string;
  size: number;
  contentHash: string;
  aspectRatio: number;
  scale: number;
  position: { x: number; y: number; z: number };
}

export interface SavedSpace {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  layout_seed: number;
  photo_meta: PhotoMeta[];
}
```

- [ ] **Step 2: Write `src/store/spaceStore.ts` with EXACTLY:**

```ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { SavedSpace, PhotoMeta } from '../types/space';

interface SpaceState {
  list: SavedSpace[];
  loadingList: boolean;
  pendingSpace: SavedSpace | null; // a saved space we're trying to reattach photos for
  fetchList: () => Promise<{ error: string | null }>;
  saveCurrent: (
    name: string,
    layoutSeed: number,
    photoMeta: PhotoMeta[],
  ) => Promise<{ error: string | null; id: string | null }>;
  deleteSpace: (id: string) => Promise<{ error: string | null }>;
  setPendingSpace: (space: SavedSpace | null) => void;
}

export const useSpaceStore = create<SpaceState>((set) => ({
  list: [],
  loadingList: false,
  pendingSpace: null,

  fetchList: async () => {
    set({ loadingList: true });
    const { data, error } = await supabase
      .from('spaces')
      .select('*')
      .order('updated_at', { ascending: false });
    set({ loadingList: false, list: (data as SavedSpace[]) ?? [] });
    return { error: error?.message ?? null };
  },

  saveCurrent: async (name, layoutSeed, photoMeta) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'Not signed in', id: null };
    const { data, error } = await supabase
      .from('spaces')
      .insert({
        user_id: user.id,
        name,
        layout_seed: layoutSeed,
        photo_meta: photoMeta,
      })
      .select()
      .single();
    return { error: error?.message ?? null, id: (data as SavedSpace | null)?.id ?? null };
  },

  deleteSpace: async (id) => {
    const { error } = await supabase.from('spaces').delete().eq('id', id);
    return { error: error?.message ?? null };
  },

  setPendingSpace: (space) => set({ pendingSpace: space }),
}));
```

- [ ] **Step 3: Commit**

```bash
git add src/types/space.ts src/store/spaceStore.ts
git commit -m "feat: SavedSpace type + spaceStore"
```

---

### Task C3: Update view machine + landing entrypoint

Add `'spaces-list'` and `'reattach'` views.

**Files:**
- Modify: `src/store/viewStore.ts`
- Modify: `src/components/LandingScreen.tsx`

- [ ] **Step 1: Replace `src/store/viewStore.ts` with EXACTLY:**

```ts
import { create } from 'zustand';

export type View = 'landing' | 'processing' | 'space' | 'spaces-list' | 'reattach';

interface ViewState {
  view: View;
  loaded: number;
  total: number;
  resetCounter: number;
  setView: (v: View) => void;
  setProgress: (loaded: number, total: number) => void;
  triggerReset: () => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: 'landing',
  loaded: 0,
  total: 0,
  resetCounter: 0,
  setView: (v) => set({ view: v }),
  setProgress: (loaded, total) => set({ loaded, total }),
  triggerReset: () => set((s) => ({ resetCounter: s.resetCounter + 1 })),
}));
```

- [ ] **Step 2: Add a "My spaces" link to `src/components/LandingScreen.tsx`. Find the `<FrostPanel>` block in the existing file and INSERT a new button below it.

Find this exact block at the end of the JSX returned (the closing `</div>` before the function ends):

```tsx
        </label>
      </FrostPanel>
    </div>
  );
}
```

REPLACE with EXACTLY:

```tsx
        </label>
      </FrostPanel>

      <button
        onClick={() => useViewStore.getState().setView('spaces-list')}
        style={{
          background: 'transparent',
          color: 'var(--text-secondary)',
          border: 'none',
          fontSize: 'var(--font-size-md)',
          cursor: 'pointer',
          textDecoration: 'underline',
          letterSpacing: '0.02em',
          marginTop: 4,
        }}
      >
        Or open a saved space →
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add spaces-list and reattach views"
```

---

### Task C4: SpacesList screen

**Files:**
- Create: `src/components/SpacesList.tsx`

- [ ] **Step 1: Write `src/components/SpacesList.tsx` with EXACTLY:**

```tsx
import { useEffect } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useSpaceStore } from '../store/spaceStore';
import { useViewStore } from '../store/viewStore';
import { useAuthStore } from '../store/authStore';

export function SpacesList() {
  const list = useSpaceStore((s) => s.list);
  const loading = useSpaceStore((s) => s.loadingList);
  const fetchList = useSpaceStore((s) => s.fetchList);
  const setPendingSpace = useSpaceStore((s) => s.setPendingSpace);
  const deleteSpace = useSpaceStore((s) => s.deleteSpace);
  const setView = useViewStore((s) => s.setView);
  const signOut = useAuthStore((s) => s.signOut);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const onOpen = (space: (typeof list)[number]) => {
    setPendingSpace(space);
    setView('reattach');
  };

  const onDelete = async (id: string) => {
    if (!confirm('Delete this space?')) return;
    await deleteSpace(id);
    fetchList();
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-6 gap-6">
      <h1
        style={{
          fontSize: 'var(--font-size-hero-medium)',
          fontWeight: 600,
          letterSpacing: '-0.02em',
        }}
      >
        My spaces
      </h1>

      <FrostPanel style={{ width: 'min(560px, 90vw)', maxHeight: '60vh', overflow: 'auto', padding: 24 }}>
        {loading && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-md)' }}>Loading…</div>
        )}
        {!loading && list.length === 0 && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-md)' }}>
            No saved spaces yet. Drop photos to create one.
          </div>
        )}
        {!loading &&
          list.map((space) => (
            <div
              key={space.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button
                  onClick={() => onOpen(space)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--font-size-lg)',
                    textAlign: 'left',
                    padding: 0,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {space.name}
                </button>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                  {space.photo_meta.length} photos · {new Date(space.updated_at).toLocaleDateString()}
                </span>
              </div>
              <button
                onClick={() => onDelete(space.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--font-size-sm)',
                  cursor: 'pointer',
                }}
                aria-label="delete"
              >
                ✕
              </button>
            </div>
          ))}
      </FrostPanel>

      <div style={{ display: 'flex', gap: 16 }}>
        <button
          onClick={() => setView('landing')}
          style={{
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
            padding: '8px 16px',
            borderRadius: 'var(--radius-button)',
            fontSize: 'var(--font-size-md)',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          ← New space
        </button>
        <button
          onClick={signOut}
          style={{
            background: 'transparent',
            color: 'var(--text-tertiary)',
            border: 'none',
            padding: '8px 16px',
            fontSize: 'var(--font-size-md)',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SpacesList.tsx
git commit -m "feat: SpacesList screen"
```

---

### Task C5: ReattachScreen — drop folder to reload a saved space

**Files:**
- Create: `src/components/ReattachScreen.tsx`
- Modify: `src/lib/loadPhoto.ts`

The flow: user picks a saved space → we have its `photo_meta` (with `contentHash` for each photo) → user drops a folder → we hash each file → match against `contentHash` → reconstruct `Photo` objects with the saved positions/scales → enter the space view.

`loadPhoto.ts` needs to OPTIONALLY accept a hash and skip computing one. Keep both paths.

- [ ] **Step 1: Modify `src/lib/loadPhoto.ts` to also export a function that returns hash + photo. REPLACE with EXACTLY:**

```ts
import type { Photo } from '../types/photo';
import { photoContentHash } from './photoHash';

const MAX_TEXTURE_EDGE = 512;

async function decodeAndCanvas(file: File): Promise<{ canvas: HTMLCanvasElement; aspectRatio: number }> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`Not an image: ${file.name} (type=${file.type})`);
  }

  const original = await createImageBitmap(file);
  const aspectRatio = original.width / original.height;

  let targetW = original.width;
  let targetH = original.height;
  if (Math.max(targetW, targetH) > MAX_TEXTURE_EDGE) {
    if (aspectRatio >= 1) {
      targetW = MAX_TEXTURE_EDGE;
      targetH = Math.round(MAX_TEXTURE_EDGE / aspectRatio);
    } else {
      targetH = MAX_TEXTURE_EDGE;
      targetW = Math.round(MAX_TEXTURE_EDGE * aspectRatio);
    }
  }

  const bitmap = await createImageBitmap(file, {
    resizeWidth: targetW,
    resizeHeight: targetH,
    resizeQuality: 'high',
  });
  original.close?.();

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  return { canvas, aspectRatio };
}

export async function loadPhoto(file: File): Promise<Photo> {
  const { canvas, aspectRatio } = await decodeAndCanvas(file);
  const blobUrl = URL.createObjectURL(file);
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    blobUrl,
    canvas,
    aspectRatio,
  };
}

export async function loadPhotoWithHash(file: File): Promise<{ photo: Photo; contentHash: string }> {
  const [{ canvas, aspectRatio }, contentHash] = await Promise.all([
    decodeAndCanvas(file),
    photoContentHash(file),
  ]);
  const blobUrl = URL.createObjectURL(file);
  return {
    photo: {
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      blobUrl,
      canvas,
      aspectRatio,
    },
    contentHash,
  };
}
```

- [ ] **Step 2: Write `src/components/ReattachScreen.tsx` with EXACTLY:**

```tsx
import { useCallback, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useSpaceStore } from '../store/spaceStore';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { loadPhotoWithHash } from '../lib/loadPhoto';
import type { PhotoSlot } from '../lib/computeLayout';
import type { Photo } from '../types/photo';

const ACCEPTED = /\.(jpe?g|png|webp)$/i;

export function ReattachScreen() {
  const space = useSpaceStore((s) => s.pendingSpace);
  const setView = useViewStore((s) => s.setView);
  const setProgress = useViewStore((s) => s.setProgress);
  const setPhotos = usePhotoStore((s) => s.setPhotos);
  const setLayout = usePhotoStore((s) => s.setLayout);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ingest = useCallback(
    async (files: File[]) => {
      if (!space) return;
      const candidates = files.filter((f) => ACCEPTED.test(f.name));
      if (candidates.length === 0) {
        setError('No JPG/PNG/WebP files in that selection.');
        return;
      }
      setError(null);
      setProgress(0, space.photo_meta.length);
      setView('processing');

      // Index saved meta by content hash for matching
      const metaByHash = new Map(space.photo_meta.map((m) => [m.contentHash, m]));

      const matchedPhotos: Photo[] = [];
      const matchedSlots: PhotoSlot[] = [];
      let processed = 0;

      for (const file of candidates) {
        try {
          const { photo, contentHash } = await loadPhotoWithHash(file);
          const meta = metaByHash.get(contentHash);
          if (meta) {
            matchedPhotos.push(photo);
            matchedSlots.push({
              index: matchedPhotos.length - 1,
              position: meta.position,
              scale: meta.scale,
            });
            metaByHash.delete(contentHash);
          }
        } catch (err) {
          console.warn(`Skipping ${file.name}:`, err);
        }
        processed++;
        setProgress(Math.min(processed, space.photo_meta.length), space.photo_meta.length);
      }

      if (matchedPhotos.length === 0) {
        setError(
          `No photos in that folder match this saved space. ` +
            `Make sure you're picking the same files you originally dropped.`,
        );
        setView('reattach');
        return;
      }

      setPhotos(matchedPhotos);
      setLayout(matchedSlots);
      setView('space');
    },
    [space, setView, setProgress, setPhotos, setLayout],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragOver(false);
      ingest(Array.from(e.dataTransfer.files));
    },
    [ingest],
  );

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      ingest(Array.from(files));
    },
    [ingest],
  );

  if (!space) {
    setView('spaces-list');
    return null;
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-3 text-center max-w-2xl">
        <h1
          style={{
            fontSize: 'var(--font-size-hero-medium)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          {space.name}
        </h1>
        <p
          style={{
            fontSize: 'var(--font-size-lg)',
            color: 'var(--text-secondary)',
            maxWidth: 520,
          }}
        >
          Drop the same folder you used to create this space ({space.photo_meta.length} photos).
          Photos stay on your device — we just match them to the saved layout.
        </p>
      </div>

      <FrostPanel
        style={{
          width: 'min(560px, 90vw)',
          padding: '48px 32px',
          textAlign: 'center',
          borderStyle: 'dashed',
          borderColor: dragOver ? 'var(--color-accent)' : 'var(--border-medium)',
          transition: 'border-color var(--duration-color) var(--ease-translate)',
        }}
      >
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{ display: 'block', cursor: 'pointer' }}
        >
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={onPick}
            style={{ display: 'none' }}
          />
          <div
            style={{
              fontSize: 'var(--font-size-xl)',
              color: 'var(--text-primary)',
              marginBottom: 8,
            }}
          >
            Drop the photos here
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-md)',
              color: 'var(--text-tertiary)',
              lineHeight: 1.5,
            }}
          >
            JPG, PNG, or WebP. We match by content hash, so renamed files still work.
          </div>
        </label>
      </FrostPanel>

      {error && (
        <div style={{ color: 'var(--color-system-red)', fontSize: 'var(--font-size-md)', textAlign: 'center', maxWidth: 520 }}>
          {error}
        </div>
      )}

      <button
        onClick={() => setView('spaces-list')}
        style={{
          background: 'transparent',
          color: 'var(--text-tertiary)',
          border: 'none',
          fontSize: 'var(--font-size-md)',
          cursor: 'pointer',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        ← Back to spaces
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Add a `setLayout` slot to `photoStore` so we can pass externally-supplied positions to `SpaceScene`. Modify `src/store/photoStore.ts` — REPLACE with EXACTLY:**

```ts
import { create } from 'zustand';
import type { Photo } from '../types/photo';
import type { PhotoSlot } from '../lib/computeLayout';

interface PhotoState {
  photos: Photo[];
  selectedId: string | null;
  layout: PhotoSlot[] | null; // null = compute fresh; non-null = use these slots verbatim
  setPhotos: (photos: Photo[]) => void;
  setLayout: (layout: PhotoSlot[] | null) => void;
  clear: () => void;
  setSelected: (id: string | null) => void;
}

export const usePhotoStore = create<PhotoState>((set, get) => ({
  photos: [],
  selectedId: null,
  layout: null,
  setPhotos: (photos) => set({ photos }),
  setLayout: (layout) => set({ layout }),
  clear: () => {
    for (const p of get().photos) {
      URL.revokeObjectURL(p.blobUrl);
    }
    set({ photos: [], selectedId: null, layout: null });
  },
  setSelected: (id) => set({ selectedId: id }),
}));
```

- [ ] **Step 4: Modify `src/components/SpaceScene.tsx` to honor `layout` if present. Find this exact block:**

```tsx
    if (photos.length > 0) {
      const slots = computeLayout(photos.length);
      for (let i = 0; i < photos.length; i++) {
```

REPLACE with EXACTLY:

```tsx
    if (photos.length > 0) {
      const layoutOverride = usePhotoStore.getState().layout;
      const slots = layoutOverride && layoutOverride.length === photos.length
        ? layoutOverride
        : computeLayout(photos.length);
      for (let i = 0; i < photos.length; i++) {
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ReattachScreen — drop folder to reload a saved space"
```

---

### Task C6: SaveSpaceModal + add Save button to HUD

**Files:**
- Create: `src/components/SaveSpaceModal.tsx`
- Modify: `src/components/SpaceHud.tsx`
- Modify: `src/components/SpaceScene.tsx` (capture layout + content hashes for save)

To save a space, we need:
- The current photos' content hashes (computed once on load and stashed in photoStore)
- The current layout (computed by `computeLayout` and stashed in photoStore)

We need to capture these at load time. Modify `LandingScreen.tsx`'s ingest to use `loadPhotoWithHash` and store hashes alongside photos. Modify `SpaceScene.tsx` to write the computed layout to the store.

- [ ] **Step 1: Add a `hashes` field to `photoStore`. Modify `src/store/photoStore.ts` — REPLACE with EXACTLY:**

```ts
import { create } from 'zustand';
import type { Photo } from '../types/photo';
import type { PhotoSlot } from '../lib/computeLayout';

interface PhotoState {
  photos: Photo[];
  hashes: string[];           // parallel array — one content hash per photo
  selectedId: string | null;
  layout: PhotoSlot[] | null;
  setPhotos: (photos: Photo[], hashes: string[]) => void;
  setLayout: (layout: PhotoSlot[] | null) => void;
  clear: () => void;
  setSelected: (id: string | null) => void;
}

export const usePhotoStore = create<PhotoState>((set, get) => ({
  photos: [],
  hashes: [],
  selectedId: null,
  layout: null,
  setPhotos: (photos, hashes) => set({ photos, hashes }),
  setLayout: (layout) => set({ layout }),
  clear: () => {
    for (const p of get().photos) {
      URL.revokeObjectURL(p.blobUrl);
    }
    set({ photos: [], hashes: [], selectedId: null, layout: null });
  },
  setSelected: (id) => set({ selectedId: id }),
}));
```

- [ ] **Step 2: Update `src/components/LandingScreen.tsx`'s ingest to use `loadPhotoWithHash`. Find:**

```tsx
import { loadPhoto } from '../lib/loadPhoto';
```

REPLACE with EXACTLY:

```tsx
import { loadPhotoWithHash } from '../lib/loadPhoto';
```

Find:

```tsx
      const out: Awaited<ReturnType<typeof loadPhoto>>[] = [];
      for (let i = 0; i < jpgs.length; i++) {
        try {
          const photo = await loadPhoto(jpgs[i]);
          out.push(photo);
        } catch (err) {
          console.warn(`Skipping ${jpgs[i].name}:`, err);
        }
        setProgress(i + 1, jpgs.length);
      }

      setPhotos(out);
      setView('space');
```

REPLACE with EXACTLY:

```tsx
      const photos: Awaited<ReturnType<typeof loadPhotoWithHash>>['photo'][] = [];
      const hashes: string[] = [];
      for (let i = 0; i < jpgs.length; i++) {
        try {
          const { photo, contentHash } = await loadPhotoWithHash(jpgs[i]);
          photos.push(photo);
          hashes.push(contentHash);
        } catch (err) {
          console.warn(`Skipping ${jpgs[i].name}:`, err);
        }
        setProgress(i + 1, jpgs.length);
      }

      setPhotos(photos, hashes);
      setView('space');
```

The `setPhotos` import is already there but its signature changed; both args are now required.

- [ ] **Step 3: Also update `ReattachScreen.tsx` to pass `[]` for hashes since reattached spaces don't need to re-save (they already exist in the DB):**

In `src/components/ReattachScreen.tsx`, find:

```tsx
      setPhotos(matchedPhotos);
```

REPLACE with EXACTLY:

```tsx
      setPhotos(matchedPhotos, matchedSlots.map(() => ''));
```

(Empty string hashes since this space is already saved; the user can resave with new hashes if they edit the layout.)

- [ ] **Step 4: Capture layout in `SpaceScene.tsx` after computing it. Find:**

```tsx
    if (photos.length > 0) {
      const layoutOverride = usePhotoStore.getState().layout;
      const slots = layoutOverride && layoutOverride.length === photos.length
        ? layoutOverride
        : computeLayout(photos.length);
```

REPLACE with EXACTLY:

```tsx
    if (photos.length > 0) {
      const layoutOverride = usePhotoStore.getState().layout;
      const slots = layoutOverride && layoutOverride.length === photos.length
        ? layoutOverride
        : computeLayout(photos.length);
      // Stash the live layout so SaveSpaceModal can persist it.
      usePhotoStore.getState().setLayout(slots);
```

- [ ] **Step 5: Write `src/components/SaveSpaceModal.tsx` with EXACTLY:**

```tsx
import { useState } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useSpaceStore } from '../store/spaceStore';
import { usePhotoStore } from '../store/photoStore';

export function SaveSpaceModal({ onClose }: { onClose: () => void }) {
  const photos = usePhotoStore((s) => s.photos);
  const hashes = usePhotoStore((s) => s.hashes);
  const layout = usePhotoStore((s) => s.layout);
  const saveCurrent = useSpaceStore((s) => s.saveCurrent);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = photos.length > 0 && hashes.length === photos.length && hashes.every((h) => h);

  const onSave = async () => {
    if (!canSave || !layout) {
      setError(
        !layout
          ? 'Layout not ready yet — please wait a moment and try again.'
          : 'This space cannot be re-saved (it was loaded from a saved space). Make a new one.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    const photoMeta = photos.map((p, i) => ({
      name: p.name,
      size: 0,
      contentHash: hashes[i],
      aspectRatio: p.aspectRatio,
      scale: layout[i].scale,
      position: layout[i].position,
    }));
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const result = await saveCurrent(name || 'Untitled space', seed, photoMeta);
    setBusy(false);
    if (result.error) setError(result.error);
    else onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 20, 20, 0.4)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <FrostPanel style={{ width: 'min(420px, 90vw)', padding: 28 }}>
          <div
            style={{
              fontSize: 'var(--font-size-xl)',
              color: 'var(--text-primary)',
              marginBottom: 16,
              fontWeight: 600,
            }}
          >
            Save this space
          </div>
          <input
            type="text"
            placeholder="Name this space"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 'var(--font-size-lg)',
              fontFamily: 'inherit',
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-button)',
              color: 'var(--text-primary)',
              marginBottom: 16,
              outline: 'none',
            }}
          />
          {error && (
            <div
              style={{
                color: 'var(--color-system-red)',
                fontSize: 'var(--font-size-md)',
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                padding: '8px 16px',
                borderRadius: 'var(--radius-button)',
                fontSize: 'var(--font-size-md)',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={busy || !canSave}
              style={{
                background: 'var(--color-accent)',
                color: 'var(--text-on-accent)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 'var(--radius-button)',
                fontSize: 'var(--font-size-md)',
                cursor: 'pointer',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                opacity: busy || !canSave ? 0.5 : 1,
              }}
            >
              {busy ? '…' : 'Save'}
            </button>
          </div>
        </FrostPanel>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add a Save button to `src/components/SpaceHud.tsx`. REPLACE with EXACTLY:**

```tsx
import { useState } from 'react';
import { FrostPanel } from './ui/FrostPanel';
import { useViewStore } from '../store/viewStore';
import { usePhotoStore } from '../store/photoStore';
import { SaveSpaceModal } from './SaveSpaceModal';

export function SpaceHud() {
  const setView = useViewStore((s) => s.setView);
  const triggerReset = useViewStore((s) => s.triggerReset);
  const photos = usePhotoStore((s) => s.photos);
  const hashes = usePhotoStore((s) => s.hashes);
  const clear = usePhotoStore((s) => s.clear);
  const [showSave, setShowSave] = useState(false);

  const onClear = () => {
    clear();
    setView('landing');
  };

  // Only allow Save when this space was loaded from local files (has hashes).
  const canSave = photos.length > 0 && hashes.length === photos.length && hashes.every((h) => h);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          zIndex: 10,
          display: 'flex',
          gap: 12,
        }}
      >
        <FrostPanel style={{ padding: '8px 14px' }}>
          <button
            onClick={onClear}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-md)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            ← New space
          </button>
        </FrostPanel>
        <FrostPanel style={{ padding: '8px 14px' }}>
          <button
            onClick={triggerReset}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-md)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            ⊙ Reset view
          </button>
        </FrostPanel>
        {canSave && (
          <FrostPanel style={{ padding: '8px 14px' }}>
            <button
              onClick={() => setShowSave(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-accent)',
                fontSize: 'var(--font-size-md)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              ⬛ Save space
            </button>
          </FrostPanel>
        )}
        <FrostPanel style={{ padding: '8px 14px' }}>
          <span
            style={{
              fontSize: 'var(--font-size-md)',
              color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
          </span>
        </FrostPanel>
      </div>
      {showSave && <SaveSpaceModal onClose={() => setShowSave(false)} />}
    </>
  );
}
```

- [ ] **Step 7: Wire the new views into `src/App.tsx`. REPLACE with EXACTLY:**

```tsx
import { SvgFilters } from './components/SvgFilters';
import { AuthGate } from './components/AuthGate';
import { LandingScreen } from './components/LandingScreen';
import { ProcessingScreen } from './components/ProcessingScreen';
import { SpaceScene } from './components/SpaceScene';
import { SpaceHud } from './components/SpaceHud';
import { PhotoLightbox } from './components/PhotoLightbox';
import { SpacesList } from './components/SpacesList';
import { ReattachScreen } from './components/ReattachScreen';
import { useViewStore } from './store/viewStore';

export default function App() {
  const view = useViewStore((s) => s.view);

  return (
    <>
      <SvgFilters />
      <AuthGate>
        {view === 'landing' && <LandingScreen />}
        {view === 'processing' && <ProcessingScreen />}
        {view === 'spaces-list' && <SpacesList />}
        {view === 'reattach' && <ReattachScreen />}
        {view === 'space' && (
          <>
            <SpaceScene />
            <SpaceHud />
            <PhotoLightbox />
          </>
        )}
      </AuthGate>
    </>
  );
}
```

- [ ] **Step 8: Verify build, tests, tsc**

```bash
npm run build
npm test
npx tsc -b
```

The build will fail without a real `.env` (Supabase client throws). That's expected at this stage. Verify ONLY `npx tsc -b` passes (typecheck-only), and ALL OTHER changes don't introduce new type errors.

If `tsc` reports errors, REPORT BLOCKED.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: SaveSpaceModal + SpaceHud Save button + view machine wiring"
```

---

## Milestone D — Vercel deploy

### Task D1: vercel.json + README updates

**Files:**
- Create: `vercel.json`
- Modify: `README.md` (or create if absent)

- [ ] **Step 1: Write `vercel.json` with EXACTLY:**

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

(SPA fallback so direct URLs hit `index.html` and the React router handles the rest.)

- [ ] **Step 2: Update README. REPLACE `README.md` with EXACTLY:**

```markdown
# PinViz

Drop a folder of photos and arrange them in 3D space. Sign in to save spaces and revisit them later.

## Stack

- React 19 + Vite + TypeScript
- Three.js (raw — custom render pipeline with SMAA + OutlinePass)
- Zustand for state
- Supabase (Auth + Postgres) for accounts and saved spaces — photos stay on your device
- Vercel for hosting

## Local development

1. Clone the repo.
2. Install: `npm install`
3. Create a Supabase project at supabase.com.
4. In the Supabase SQL editor, run `supabase/migrations/0001_init.sql`.
5. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase → Settings → API.
6. `npm run dev` → http://localhost:5173

## Deploy to Vercel

1. Push the repo to GitHub.
2. Import the repo at vercel.com/new.
3. Set environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Vercel auto-detects Vite and serves the static build.

In Supabase → Authentication → URL Configuration, add your Vercel deployment URL to "Site URL" and "Redirect URLs" so magic links work in production.

## How saved spaces work

When you drop photos, PinViz hashes the first 64 KB of each file. Saving a space stores those hashes plus your layout in Supabase. Photos themselves never leave your device. To revisit a space, drop the same folder — files are matched by hash, so renamed files still work.
```

- [ ] **Step 3: Commit + push**

```bash
git add vercel.json README.md
git commit -m "docs: vercel config + README"
git push
```

---

### Task D2: Manual deploy steps (handed back to user)

The implementer cannot complete these without user credentials. Include them in the final report:

1. **Create Supabase project + run migration** (if not done in A1/A2 already).
2. **Set up Vercel:**
   - Go to vercel.com/new
   - Import the GitHub repo `aivsomkar/PinViz`
   - Framework preset: Vite (auto-detected)
   - Add env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - Deploy
3. **Update Supabase auth URLs:**
   - Supabase dashboard → Authentication → URL Configuration
   - Site URL: your Vercel URL (e.g., `https://pinviz.vercel.app`)
   - Redirect URLs: same URL with `/**` suffix

4. **Test:** sign up, drop photos, save a space, sign out, sign back in, open the saved space, drop the same folder — confirm reattachment works.

---

## Self-Review Notes

**Coverage:**
- Auth: B1–B4 ✓
- Saved spaces (DB): C1–C6 ✓
- Photo re-attachment via content hash: C5 ✓
- Vercel deploy config: D1 ✓

**Out of scope (intentional):**
- Photo upload to Supabase Storage (v2)
- Public sharing of spaces (v2)
- OAuth providers beyond email (Google/GitHub can be added later via Supabase dashboard with no code changes — the `signInWithOAuth` method already exists in the SDK)
- Password reset flow (Supabase has built-in support; can be added in a follow-up)

**Type consistency:** `Photo` shape unchanged. New `PhotoMeta` and `SavedSpace` types are independent. `setPhotos` signature changed — all callers updated in C6.

**No-secrets check:** `.env` is gitignored; only `.env.example` is committed.

**Placeholder scan:** No TBDs.
