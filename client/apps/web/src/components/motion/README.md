# beUI components (vendored)

Source: https://beui.dev (https://github.com/starc007/ui-components), MIT License, Copyright (c) 2026 Saurabh Chauhan.
The components are copy-paste (shadcn-style registry), so they live in this repository and are ours to edit.
The files were reviewed before being added (no network access, `eval`, storage or HTML injection) and keep
their upstream paths and `@/` imports so `npx shadcn add @beui/<name>` updates map onto them.

Used: `button/base`, `input`, `select`, `tabs`, `combobox` (+ `lib/utils.ts`, `lib/ease.ts`, `lib/hooks/*`).
Runtime dependencies: `motion`, `lucide-react`, `clsx`, `tailwind-merge`. Theme tokens are defined in
`src/styles.css` (shadcn-style semantic tokens).

## Local changes (re-apply after pulling an update)

| File | Change | Why |
| --- | --- | --- |
| all `*.tsx` | `motion.<tag>` → `m.<tag>`, import `m` instead of `motion` | The app wraps everything in `<LazyMotion strict>`; the animation features load asynchronously (`src/lib/motion-features.ts`), which keeps about 25 KB gzip off the critical path |
| `button/base.tsx` | remove `whileHover` scale (press scale kept), add `cursor-pointer` | Buttons do not animate on hover; the pointer cursor is explicit |
| `button/base.tsx` | export `VARIANT_CLASS` and `SIZE_CLASS` | Link-styled buttons (router links) reuse the same classes (`buttonClass` in `components/ui.tsx`) |
| `input.tsx` | placeholder colour `muted-foreground/60` → `muted-foreground` | The 60% tint was 2.3:1 on white (WCAG AA needs 4.5:1) |
| `input.tsx` | uncontrolled mode passes `defaultValue` to the `<input>` instead of a controlled `value` | Text typed before hydration finishes is not wiped when React attaches (the gallery search relies on it) |
| `select.tsx` | `SelectTrigger` accepts `aria-label` | The visible text is only the current value, so it needs an accessible name |
