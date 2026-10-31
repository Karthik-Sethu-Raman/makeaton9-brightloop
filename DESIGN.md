# DESIGN.md — the binding design system (ALL agents follow this file exactly)

> Copied into the repo at 09:30 tomorrow. It exists so 4 autonomous agents produce ONE
> consistent UI (a graded must-have: "consistent color scheme and layout") and so the app
> doesn't look like every AI-generated dashboard the evaluators will see 40 times tomorrow.
> If a design skill is available in your session, it refines this file via the integrator
> only — workers never change tokens.

## Fill-in — DONE at bootstrap (08:55, Karthik). Tokens below are final LAW.
Ran the ui-ux-pro-max design-system search for the billing domain. Adopted: Swiss-minimal
structure + slate neutrals (draw 2), Fira Sans grotesk (draw 1, "dashboard/data/precise"
mood, real tabular figures) with local fallbacks (NO webfont fetch — offline demo).
Rejected: draw-1 purple/orange (banned hues), draw-2 green accent (collides with
--positive status semantics). Accent chosen from the subject's world: **coin copper**
— the metal of money, invoices and bank statements.

## Identity (set at bootstrap — do not change)
- **App name: Cadence** — from "billing cadence" (daily / weekly / monthly / yearly), the
  heartbeat of a subscription business. Tagline: "Run plans, subscriptions and recurring
  billing in one place."
- **Mark:** a 20px copper ring with one filled copper dot on its rim at the two-o'clock
  tick — a billing cycle caught mid-turn. Plain SVG stroke+circle, no gradients. Wordmark
  "Cadence" in Fira Sans 500 beside it.
- **Currency:** ₹ with en-IN grouping (₹12,34,567), tabular figures everywhere numbers
  render. Fixed decimals: money ₹2, percentages 0.0%, counts integers.

## Tokens (FINAL — every agent uses ONLY these)
```css
:root {
  --ground:#f8fafc; --surface:#ffffff; --raised:#f7f8fa; --active:#e9edf1;
  --border:#e4e7eb; --rule:#eef1f3; --control:#cdd5dc;
  --text:#111827; --muted:#475569; --faint:#64748b;
  --primary:#16191d;            /* near-black primary button, white label. ONE per screen. */
  --accent:#b45309;             /* coin copper — data + at most one control per screen. */
  --positive:#247b50; --pill-positive-bg:#dcfae5; --pill-positive-ink:#04250e;
  --negative:#c4242a; --pill-negative-bg:#ffedea; --pill-negative-ink:#831c1e;
  --pill-warning-bg:#fffbeb; --pill-warning-ink:#92400e;
  --grid:#e5e5e5;
  --radius-card:8px; --radius-control:6px; --radius-chip:4px;
  --gap:16px; --card-pad:20px; --pad:24px;
  --control-height:32px; --row-height:48px;
  --font:"Fira Sans","Segoe UI",system-ui,-apple-system,sans-serif; /* grotesk, tabular figures via .num */
  --fs-title:24px; --fs-section:16px; --fs-kpi:24px; --fs-body:14px; --fs-small:12px;
}
.num { font-variant-numeric: tabular-nums; }
```

## Screens (one question each — the screen exists to answer it)
- Overview (first screen): "How healthy is the recurring business right now?"
- Subscriptions: "Where does every subscription stand today?"
- Products & plans: "What are we selling, at what price, on what cadence?"
- Invoices: "What was billed, and what is still unpaid?"
- Payments: "Which money came in, against which invoice?"
- Discounts: "Which price rules are live, and when do they stop?"
- Customers: "Who buys from us, and what do they hold?"
- Portal (customer login): "What am I paying for, and what comes next?"
Rules of the tokens: accent ≤ ~3% of pixels, on DATA + at most one control. Never violet/indigo/brand-blue defaults. Text tiers all ≥ 4.5:1 contrast. Type scale: 12/14/16/24 + one 24px h1 per screen; no figure ≥ 48px; no landing-page hero.

## Shell
- Labelled left sidebar 224–240px on the PAGE ground (never dark/saturated sidebar on light app), or no sidebar (top bar + centred 1100–1200px) if ≤5 destinations.
- Product mark + name at sidebar top; workspace/scope shown; every screen has one h1 (a noun, 24px, not "Welcome back 👋").
- Active nav item = neutral grey pill (#eeeeee, radius 8) or brightness change on dark. NEVER colored pill + left accent bar.
- One gutter value everywhere (16px). Grid arithmetic must close — write the sum in a comment. Cards sharing a row share a bottom edge; no orphan cells, no stretched-empty cards, no 40px+ blank bands inside cards.
- The most frequent job = one click from the first screen (a real control in the title row or on the row that needs it).

## KPIs
- ONE container split by 1px rules into equal columns (median 3–4). NOT a card per KPI with an icon in a tinted circle (that's the #1 generated tell), NO sparklines.
- Label (12–14px grey) above value (24px, tabular figures, 400–600). The screen's answer figure is 30–36px and ≥1.3× siblings.
- Deltas: name the window ("vs prior 30 days"), color says GOOD/BAD not up/down (latency rising = bad = negative color), zero/undefined change = grey dash or "+4 (new)". No green +12% pill on everything.

## Charts (dynamic data is a graded must-have — draw it honestly)
- One question, one series per chart; 3 series max per screen. Switch metrics with a control, never overlay 4 lines.
- ONE hue per chart (the accent on the screen's MAIN data element); neutrals for the rest. NEVER rainbow, a hue per bar, or one subject in two hues. ≤4 hues per screen total.
- Lines 2px straight segments, no markers, no fill (or ≤14% flat tint). Bars square/4px-top-radius. Gridlines: 3–5 horizontal 1px #e5e5e5, no y-axis line, no legend for a single series.
- Y ticks 4–7 round even steps, top tick above max, zero baseline for counts. X labels 4–8, never rotated. NEVER no scale (hover-only magnitude is flagged).
- Annotate the event that matters (1px marker + 12px label: "feed restarted"); reference lines dashed with end label.
- Live-data updates: keep the old values until new land (no flash); numbers in tabular figures so columns don't jitter; a freshness stamp ("Updated 16:02") with refresh.
- Tooltips on hover: plain label + value, no arrow. A table view / data list exists for the chart's data somewhere in the app.

## Tables & lists
- 12px grey sentence-case headers (never uppercase tracked), no header fill band, no zebra. Row rules 1px #f2f2f2.
- Numbers RIGHT-ALIGNED tabular, fixed decimals per metric (₹2 / 0.0% / counts), thousands separators, sign on every change, units as smaller grey suffix. One right edge per row.
- Identity column gets 1/3–1/2 width. Missing = grey dash, real zero printed ("$0"). Truncate one line + ellipsis.
- Status pills: pale tint + dark text of same hue (never saturated fill + white text). ONE status mark per row.
- Overview lists: 4–6 rows + "View all (N)", never pagination.

## Forms & validation (graded must-have — build it like it's judged, because it is)
- Label ABOVE the field (14px/500), never placeholder-as-label. Inputs 38–40px, white, 1px border, radius 8.
- Validate inline on blur, error message UNDER the failing field in --negative with 4.5:1, error summary on top for long forms, focus jumps to first error. Client AND server both validate (mention both in Q&A notes).
- Never silently disable submit without saying why. Disabled controls stay legible + explain.
- One save model per view. Destructive action: separate section, words about consequence, confirmation naming the object.

## States (each block ships all four or the task isn't DONE)
- Empty: keep frame + header + one sentence ("No readings in this range yet") — never an illustration.
- Zero: printed ("0", "0.0%") in normal style. Missing: grey dash.
- Loading: final layout with flat grey bars at real sizes, no shimmer, no layout shift when data lands.
- Error: inside the failed block, one sentence + last-good time + Retry text button. Never a full-screen red banner.

## Phone (responsive is graded — check 390px every UI task)
- Sidebar folds: 48px top bar w/ menu sheet, or bottom nav ≤5. Touch targets ≥44px. Margins 16–20px.
- Tables → two-line rows below ~640px (identity + key number; other fields line 2, 13px grey). NEVER horizontal page scroll.
- KPI strip → 2-column grid. Charts full-width 160–200px tall. At most ONE row of controls above the first chart/list.

## Banned (instant judge-killer tells — the inspector list, condensed)
No gradients on grounds/buttons/cards/text · no glows/glass/backdrop-blur · no icon-in-tinted-circle on KPIs/cards · no sparklines on KPIs · no "Welcome back" + emoji greeting · no dark sidebar on light app · no zebra tables/uppercase tracked headers · no left-aligned/proportional-digit numbers · no rainbow charts · no saturated status chips · no accent on every button/tab/link · no violet/indigo/default-blue accents · no lorem ipsum/Acme/John Doe/vanity "+10,000 users" · no pagination under short lists · no 48px+ figures or 32px+ titles · no emoji anywhere in the UI · no fake dashboards of grey bars.
