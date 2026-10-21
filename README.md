# MOVE Supply Chain Decision Hub

Internal tool for Move Supply Chain Logistics Experts, organized as a hub of decision modules. 3PL Sourcing (manage 3PL sourcing projects end to end) is live at `/3pl-sourcing`; Forwarder Sourcing, Tariff Calculator, Landed Cost Calculator, 3PL Audit, and Forwarder Audit are coming soon.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment

Set these in `.env.local` for local development (see `.env.example`) and in the Vercel project settings for deployments. Server-side variables are read when the server starts: after changing one in Vercel, **redeploy** for it to take effect.

- `LANDED_COST_ENABLED`: `true` turns on the Landed Cost module (its pages, its Server Actions and its nav link). Anything else, or unset, keeps it off: the pages are a 404, the actions refuse, and the nav shows "Soon". Read on the server only. Run locally with it on: `LANDED_COST_ENABLED=true npm run dev`.

## Project Structure

- `src/app/` — routes (Next.js App Router); hub home at `/`, 3PL Sourcing under `src/app/(authenticated)/3pl-sourcing/`
- `src/components/` — UI pieces
- `src/lib/` — shared logic, helpers, API clients (module list in `src/lib/modules.ts`)
- `src/styles/` — global styles
- `public/` — static assets
- `docs/` — project documentation
