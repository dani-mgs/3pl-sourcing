# Design System — 3PL Sourcing Platform

Direction: clean, precise, and a little architectural. Soft geometric shapes (rounded corners, pill badges) instead of sharp edges. This is an internal ops tool — clarity and consistency first, restrained polish, not a marketing site.

## Colors
- Ink Navy #1E2540 — headings, primary text, dark UI elements
- Route Indigo #4F46E5 — primary buttons, links, active states, focus rings
- Route Indigo Hover #4338CA
- Cargo Amber #F59E0B — sparing accent, signature route-line, "in progress" emphasis
- Mist #F5F6FA — page background
- Fog #E4E7EF — borders, dividers
- Slate #6B7280 — muted text, timestamps, captions
- Danger Rose #E11D48 — errors, destructive actions
- Success Emerald #059669 — confirmations, "Vetted" status

Status pipeline badges (soft pastel-tinted, not saturated defaults):
- Potential: bg #F1F2F6, text #6B7280
- Contacted: bg #E8E7FC, text #4F46E5
- Discovery Call: bg #FEF3E2, text #B45309
- Quotation Received: bg #FEF3E2, text #F59E0B
- Negotiation: bg #FFE4E0, text #EA580C
- Vetted: bg #D1FAE5, text #059669
- Rejected: bg #FFE1E7, text #E11D48

## Typography
- Display/headings: Space Grotesk, loaded via next/font/google
- Body: Inter, loaded via next/font/google
- Page title: Space Grotesk, text-2xl font-semibold
- Section title: Space Grotesk, text-lg font-semibold
- Body: Inter, text-sm
- Muted/caption: Inter, text-xs text-slate-500

## Shape
- Cards/containers: rounded-2xl, shadow-sm, border in Fog
- Buttons: rounded-xl
- Badges/pills: rounded-full
- Inputs: rounded-xl, border in Fog, focus ring in Route Indigo

## Component conventions
- Primary button: bg Route Indigo, hover Route Indigo Hover, white text, text-sm font-medium, px-4 py-2.5, rounded-xl, shadow-sm
- Secondary button: border Fog, hover bg Mist, Ink Navy text, text-sm font-medium, px-4 py-2.5, rounded-xl
- Danger button: bg Danger Rose, hover darker rose, white text, same sizing as primary
- Card: bg white, rounded-2xl, shadow-sm, border Fog, p-6
- Table: header row text-xs text-slate-500 uppercase tracking-wide border-b Fog; body rows border-b Fog, hover bg Mist; always use per-cell Links for row navigation, never an absolute-overlay Link on <tr>
- Status pipeline (signature element, used only on the 3PL detail page): horizontal connected dots/nodes — filled Route Indigo for completed steps, Cargo Amber ring for current step, empty Fog-outlined for upcoming steps, connected by a thin line. Compact views elsewhere use the simple pill badges instead.
- Empty state: centered, text-slate-500 text-sm, one direct sentence plus an action, e.g. "No projects yet. Create your first one to get started."

## Deliberately out of scope
No dark mode, no heavy animation, no illustrations, no custom icon set beyond what's needed. Keep restraint everywhere except the signature status-pipeline element.
