# Tariff seed scripts

The additional-duty seeds (`supabase/migrations/*_tariff_seed_*.sql`) are generated, never hand-typed:

```
official sources ──fetch──▶ .cache/tariff-sources/   (not committed; SHA-256 pinned in sources.json)
                 ──extract─▶ data/tariff/<seed>/      seed.json (duty rows) + scope.csv (HTS lines, with source location)
                 ──seed────▶ supabase/migrations/…    (byte-for-byte; checked by scripts/tariff/seeds.test.mjs)
```

| Command | What it does |
|---|---|
| `npm run tariff:fetch` | Downloads every source in `sources.json` and checks its hash. Exits 1 if a source changed. |
| `npm run tariff:fetch -- --update` | Records new hashes (only after the regenerated seed is reviewed). |
| `npm run tariff:extract` | Re-extracts every seed's data files from the cached sources (and, for 2b, the cross-check report and spot-check file in `docs/tariff-data/`). |
| `npm run tariff:seed` | Writes each seed migration from its data files (`-- --check` only compares). |
| `npm run tariff:verify` | All of the above in check mode: sources unchanged, extraction reproduces the committed data, migrations match. |

## When a source changes (new HTS revision, new USTR notice)

1. `npm run tariff:fetch` reports which sources changed.
2. `npm run tariff:extract`, then read the diff in `data/tariff/` and the cross-check report.
3. Don't edit a committed seed migration (it may already be applied). Put changes in a **new** migration, or through the Duty data screens, where they go back to pending review. Then record the new hashes with `npm run tariff:fetch -- --update`.

## Layout

- `lib/` — source pinning (`sources.mjs`), text from Federal Register pages, PDFs (pdf-parse) and Word files (mammoth), CSV, SQL generation.
- `parse/` — pure parsers, one per source, each tested against real snippets of that source (`*.test.mjs`, `__fixtures__/`).
- `extract-*.mjs` — one per seed: reads the cached sources, runs the parsers and cross-checks, writes the data files.
- `generate-seeds.mjs` — data files → migrations.

Seeded rows always start **pending review**; nothing counts toward an estimate until a tariff editor reviews the program (Tariff Calculator → Duty data).
