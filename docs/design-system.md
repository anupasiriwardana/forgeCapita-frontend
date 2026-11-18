# ForgeCapita design system

Dark only. Near-black, slightly green background; flat cards with hairline borders; one mint accent. Tokens live in `app/globals.css` (`:root`). Components live in `components/ui/`.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#070908` | Page background |
| `--bg-elevated` | `#0b0e0d` | Sidebar, inputs |
| `--surface` / `--surface-2` / `--surface-hover` | `#101413` / `#151a18` / `#1a201e` | Cards, nested panels, hover |
| `--border` / `--border-strong` | white 6% / 12% | Hairlines, inputs |
| `--accent` / `--accent-strong` | `#3ee08f` / `#22c57a` | Primary action, active state, chart line |
| `--accent-soft` / `--accent-border` | mint 12% / 30% | Tinted backgrounds, borders |
| `--accent-contrast` | `#04140b` | Text on accent (11.0:1) |
| `--text` / `--text-2` / `--text-3` | `#f2f5f3` / `#a3ada9` / `#66706c` | Primary, secondary (8.0:1 on surface), tertiary |
| `--success` `--danger` `--warning` `--info` (+ `-soft`) | mint / `#ff5c6c` / `#f5b544` / `#6aa8ff` | Status |
| `--r-sm` `--r-md` `--r-lg` `--r-xl` `--r-pill` | 8 / 12 / 16 / 22 / 999 px | Radii |

`--text-3` is 3.6:1 on `--surface`. Use it only for placeholders, table headers, large text or non-essential labels, never for body text.

Legacy token names (`--bg-card`, `--brand-*`, `--teal`, `--emerald`, `--rose`, `--amber`, `--text-primary/secondary/muted`, `--radius-*`) still work and are mapped to the new palette. The classes `.btn-*`, `.input-field` and `.alert` / `.alert-*` are the implementation of `Button`, `Field` controls and `InlineAlert`; use the components, not the classes. `.glass-card`, `.section-tag`, `.modal-*` and the gradient utilities were removed (WS-19.6).

Fonts: Inter (`--font-sans`) for UI, JetBrains Mono (`--font-mono`, `.mono`) for addresses and hashes. Add `.num` (tabular figures) to every number that can change or line up in columns. App UI is 14px; public text pages wrap copy in `.prose-body` (16px).

## Components (`components/ui/`)

- `Button` (`primary | secondary | ghost | danger | subtle`, `sm | md | lg`, `loading`, `leftIcon`, `rightIcon`) and `ButtonLink` (next/link).
- `Card`, `CardHeader` (`title`, `subtitle`, `actions`), `CardBody`, `CardFooter`; `StatCard` (`label`, `value`, `unit`, `delta`, `hint`, `icon`, `loading`).
- `StatusPill` (`success | warning | danger | info | neutral | accent`), dot plus text. `StatusIcon` for inline icon plus label.
- `Field` (`label`, `hint`, `error`, `required`) wraps `Input`, `Textarea`, `Select` and wires `id`, `aria-describedby`, `aria-invalid`.
- `SegmentedControl` (radio group, arrow keys), `Tabs` (tablist, arrow keys).
- `DataTable` (`columns`, `rows`, `rowKey`, `caption`, `loading`, empty state, `onRowClick`, `dense`, `stickyHeader`).
- `EmptyState`, `Skeleton`, `Spinner`, `ErrorState` (`message`, `requestId` copyable, `onRetry`).
- `InlineAlert` (`info | success | warning | danger`, `title`, `action`).
- `Dialog` + `DialogContent` (`title` and `description` required), `ConfirmDialog` (async `onConfirm`, shows loading and error).
- `Tooltip` (provider mounted in `Providers`), `Toaster` (mounted in `Providers`) and `lib/toast.ts`.
- `AddressChip` (short mono address with copy), `Amount` (bigint wei or preformatted string, mono tabular), `CopyButton`.
- Charts in `components/ui/charts/`: `AreaChart`, `BarChart`, `DonutChart`, each with a required text `summary`.

## Page layout

- `.page-container` wraps every page (max 1280px); add `.page-container-medium` (1128px) or `.page-container-narrow` (808px) for forms and reading pages. `.page-back` is the "Back to ..." link above the header.
- App pages open with `.page-title-row`: a `div` holding an optional `.eyebrow`, the page's single `h1` and a `p` intro, plus an optional `.page-title-actions` group on the right.
- Public pages use `PageHero` (`components/PageHero.tsx`: `eyebrow`, `title`, `intro`, `aside`) instead; it renders the single `h1`.
- `.kpi-grid` lays out `StatCard`s (auto-fit, min 200px). Never sum amounts across chains in one card.
- `.detail-layout` is the two-column detail page: `.detail-main` (content) and `.detail-side` (380px actions column), both vertical stacks with 16px gaps; it collapses to one column on small screens.
- Vertical rhythm comes from the parent: `.section-stack` (16px), `.stack-md` (12px), `.stack-sm` (8px), `.section-block` (32px top). Components such as `ProfileRequiredNotice` carry no outer margin; pass `className="panel-gap"` only when the parent is not a stack.
- Admin pages (`components/admin/shared.tsx`): `AdminPageHeader` (`title`, `description`, `actions`) at the top, a `Card className="admin-toolbar"` holding `StatusFilter` (segmented control, `""` means all), then `AdminListCard` (`error`, `errorTitle`, `onRetry`, `hasData`, `footer`) around the `DataTable`, with `AdminPager` as the footer. `AdminListCard` shows `ErrorState` when nothing loaded yet and an `InlineAlert` above stale data otherwise.

## Usage rules

- **Toast** (`toast.success`, `toastApiError`) for short-lived feedback on an action the user just took: saved, copied, transaction submitted, request failed. Never the only place an important state is shown.
- **InlineAlert** for persistent, in-context information: a blocked form, a warning about the current page, a validation summary, an error loading a section.
- **ConfirmDialog** before irreversible or costly actions (on-chain transactions, role changes, shutdowns). Use `tone="danger"` for destructive ones and for actions the body says cannot be undone. Pass an async `onConfirm`: the dialog shows the loading state, closes on success and shows a thrown error inline (mapped with `describeApiError` or `describeError`). Extra inputs (for example a note) go in its `children`.
- **Dialog** + `DialogContent` for every other modal; never hand-build overlays. `title` and `description` are required.
- **ErrorState** for a whole page or section that failed to load; show the `requestId` when the API returned one and always offer `onRetry`.
- **API errors**: map with `describeApiError` (or `describeFounderError` on founder routes); never show `err.message` from non-API errors, stacks or JSON. For one-off actions use `toastApiError(err, fallback)`, or `toastErrorWithRef(message, err)` when the message is mapped locally; both add `Ref: <requestId>`.
- **Wallet errors** (`lib/walletErrors.ts`): `toastTxError(err, fallback)` for failed transactions. It shows a calm info toast "Request cancelled in wallet" when the user rejected the request (`isUserRejection`) and otherwise viem's one-line `shortMessage`. Do not show a red error or a persistent failure alert for a wallet cancel.
- **Loading**: cards and tables show `Skeleton` blocks (or `DataTable loading`, `StatCard loading`) with sr-only "Loading" text in a `role="status"` container; async buttons use `Button loading`, never a text swap alone.
- **Forms**: every control sits in `Field` (`label`, `hint`, `error`); errors appear inline under the control and set `aria-invalid`.
- Status is never conveyed by colour or an icon alone: always pair it with text (`StatusPill`, `StatusIcon label`, sr-only text).
- Icon-only buttons need an `aria-label`. Decorative icons get `aria-hidden="true"`. Use lucide icons, never emoji or arrow glyphs.
- Numbers use `.num`; addresses and hashes use `.mono` or `AddressChip`. Amounts stay `bigint` until the UI edge (`Amount`, `formatTokenAmount`).
- Charts show real data only. With no data, the chart renders its empty state; never fill with sample or placeholder values.
- No purple or indigo. One soft mint glow at most per page (`.hero-glow`).
