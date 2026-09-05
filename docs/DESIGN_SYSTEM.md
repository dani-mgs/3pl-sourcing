# Design System — 3PL Sourcing Platform

Subset of Move Supply Chain's actual brand (per their brand guidelines), adapted for a dense internal tool. Same colors and typographic character as their marketing site, calmer proportions — no gradients or hero shapes, this is a data-heavy work tool, not a landing page.

## Colors
- Move Green (Primary) #44B048 — primary buttons, links, active states, focus rings
- Move Green Hover #3A9A3E
- Move Navy (Secondary) #192E5B — headings, primary text, header bar background
- Move Orange (Accent) #FF5E43 — sparing use only: current-step highlight in status pipeline, urgent/attention-worthy states. Never a default button color.
- Neutral Background #F7F8FA — page background
- Neutral Border #E5E7EB — borders, dividers
- Neutral Muted #6B7280 — timestamps, captions, secondary text
- Surface #FFFFFF — cards, tables
- Danger #DC2626 — errors, destructive actions

Status colors (14 values):
- Potential / Not Contacted: bg #F1F2F4, text #6B7280
- Baseline: bg #EEF0F4, text #4B5563
- Contacted: bg #E3F2FD, text #1565C0
- Client Requirements Sent: bg #E1EEFB, text #0D47A1
- Scheduled for Discovery Call: bg #E0F2F1, text #00796B
- Waiting for Quotation: bg #FFF8E1, text #B8860B
- Reviewing Quotation: bg #FFF3CD, text #92700A
- Clarifications: bg #FFE8CC, text #B15400
- Negotiation: bg #DCFCE7, text #15803D
- Shortlisted: bg #D1FAE5, text #0F766E
- Vetted: bg #D1FAE5, text #059669
- Unfit: bg #FDE8E8, text #DC2626
- Do not Contact: bg #FBE0E0, text #B91C1C
- Withdrawn / No Response: bg #F1F2F4, text #9CA3AF
- Completed / Closed: bg #E3E9F5, text #192E5B

Assessment colors (5 values, new field "assessment_status"):
- Under Assessment: bg #F1F2F4, text #6B7280
- Fit: bg #DCFCE7, text #15803D
- Move Recommended: bg #D1FAE5, text #059669
- Unfit: bg #FDE8E8, text #DC2626
- Awarded/Approved: bg #E3E9F5, text #192E5B

## Typography
- Headings: Plus Jakarta Sans, loaded via next/font/google (free substitute for Move's Aeonik — closest match in geometric character)
- Body: Inter, loaded via next/font/google (substitute for Move's ITC Avant Garde — better suited to dense tables/forms)
- Page title: Plus Jakarta Sans, text-2xl font-semibold
- Section title: Plus Jakarta Sans, text-lg font-semibold
- Body: Inter, text-sm
- Muted/caption: Inter, text-xs text-slate-500

## Shape
- Cards/containers: rounded-2xl, shadow-sm, border in Neutral Border, bg white
- Buttons: rounded-xl
- Badges/pills: rounded-full
- Inputs: rounded-xl, border Neutral Border, focus ring in Move Green
- Header bar: solid Move Navy background, white text/icons

## Spacing & Layout Rhythm
- Header bar: fixed height h-16 (64px), horizontal padding px-8, vertical content vertically centered (flex items-center justify-between). Never let header content touch the top/bottom edge of the bar.
- Page container: max-w-6xl mx-auto px-8 py-10 (not px-4 py-8 — needs more breathing room on wide screens)
- Page title + primary action row (e.g. "Projects" + "New Project" button): flex justify-between items-center, with mb-8 below this row before any content starts
- Between major page sections (e.g. an info card and a table below it, or stacked cards): gap-6 minimum
- Card internal padding: p-6 minimum, p-8 for a card that's the primary content of a page (not a small supporting card)
- Table cells: px-4 py-3 (increase from any tighter default) so rows have visible breathing room, not text touching cell edges
- Form fields: gap-4 between stacked fields, gap-2 between a label and its input
- Buttons: px-4 py-2.5 minimum (already specified, re-confirming it applies everywhere, no page should use a smaller button)

General rule: nothing should visually touch another element's edge or the viewport edge. Every section needs deliberate space around it — if in doubt, add more space, not less.

## Component conventions
- Primary button: bg Move Green, hover Move Green Hover, white text, text-sm font-medium, px-4 py-2.5, rounded-xl, shadow-sm
- Secondary button: border Neutral Border, hover bg Neutral Background, Move Navy text, text-sm font-medium, px-4 py-2.5, rounded-xl
- Danger button: bg Danger, hover darker red, white text, same sizing as primary
- Header bar: bg Move Navy, white text, app name in Plus Jakarta Sans, "Log Out" as an outlined white button
- Card: bg white, rounded-2xl, shadow-sm, border Neutral Border, p-6
- Table: header row text-xs text-slate-500 uppercase tracking-wide border-b Neutral Border; body rows border-b Neutral Border, hover bg Neutral Background; always per-cell Links for row navigation, never absolute-overlay on <tr>
- Status pipeline (signature element, 3PL detail page): horizontal connected nodes — filled Move Green for completed steps, Move Orange ring for current step, empty outline for upcoming steps, connected by a thin line
- Empty state: centered, text-slate-500 text-sm, one direct sentence plus an action

## Deliberately out of scope
No dark mode, no heavy animation, no illustrations, no gradients, no hero-style layout blocks — those belong on Move's marketing site, not this internal tool. Restraint everywhere except the signature status-pipeline element.
