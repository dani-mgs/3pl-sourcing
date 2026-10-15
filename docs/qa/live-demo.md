# Live demo client

`npm run demo:live` puts one filled-in, fictional client on a Supabase project so staff can try the app hands-on. `npm run demo:remove` takes it off again. The script is `scripts/demo/live-demo.mjs`. It's run from your own terminal and isn't part of the deployed app.

## What it creates

One client, **Brightline Apparel (Demo)**, on the paid Market Report plan, owned by the staff user you name:

- **3PL project (US West Coast):** 10 3PLs.
  - 7 with rate cards, so Cost Comparison has rows to rank. One of the 7 is the incumbent (Baseline).
  - 3 shortlisted, with a saved recommendation (Cost Savings).
  - 3 without rates, shown as "not enough data to rank".
  - The rest spread across statuses and assessments.
- **Forwarder project (Ho Chi Minh City → Los Angeles):** 12 forwarders, one quote each.
  - DDP / Sea / FCL with a $10,000 baseline.
  - 3 shortlisted.
  - 2 with expired rates.
  - 2 on different terms (DDU).
  - 4 out of the running (Unfit, Do Not Contact, 2 Withdrawn).
- **What the client sees:**
  - a published client update on each project, the 3PL one asking for a decision;
  - one published Market Report: the shortlist named, the others as Partner D, E, …, each with Move's take.
- **Requests inbox:** an approval of the 3PL recommendation, a question with "Please call me", and an introduction request for a lettered forwarder.
- **Duty estimate:** one saved estimate, linked to the forwarder project and the recommended forwarder's quote (HTS 6109.10.00.12). If the project's HTS data hasn't got that code, the estimate is skipped with a warning and the rest of the run goes ahead.
- **Portal user (only with `--with-portal-user`):** `brightline-demo@demo.example.test`, role client, who must change their password at first sign-in. Its one-time password is printed once in your terminal and saved nowhere. Without this flag no client login is made, and testers use **View as client** instead. The requests then show as from "Someone at your company".

**Dates** are set relative to the day of the first run, and re-running doesn't move them. To refresh the dates, remove the client and seed it again.

## How it's built

Everything goes through the app's own code, so the data passes the same checks as data entered in the app:
- the form parsers (Zod rules and column limits);
- `saveRateDetails`, and the FX source check on quotes;
- the client-update and Market Report loaders and builders, with shortlist-only naming, the "Move's take" guard and the strict payload schemas;
- the duty-estimate builder, saved through `save_duty_estimate()`.

**The two exceptions:** partner letters and client requests are written directly, because their database functions need a signed-in owner or client:
- **Partner letters** are written as `assign_partner_labels()` writes them, using the database's own `market_report_label_at()`.
- **Requests** have the same columns and the same frozen snapshots as `submit_client_request()` / `submit_client_introduction()`.

A local check confirmed that both match what those functions produce, column for column.

## Safety

- **A dry run by default.** It reads the target, prints exactly what it would create (or that something already exists), validates every form, and writes nothing.
- **Writing needs `--apply`.** On production it also needs `--confirm-project=<ref>` matching the URL, and you type the ref at a prompt. It only runs in an interactive terminal.
- **The target** comes only from environment variables you set in your own terminal, never from `.env` files:
  - `DEMO_TARGET_URL`: exactly `https://vnidvcskfsyfytdjbiji.supabase.co`; any other project is refused.
  - `DEMO_TARGET_SERVICE_KEY`: the project's **new secret API key** (`sb_secret_...`, Supabase dashboard → Project Settings → API Keys). A legacy `service_role` JWT (starting `eyJ`) is refused, because it can't be revoked on its own. Make a dedicated secret key for this and revoke it afterwards.
  - `DEMO_OWNER_EMAIL`: an existing staff user (logistics expert or admin). The run fails if that user isn't found or isn't staff.
- **What it never prints:** the key, or the owner's email except masked (`j***@m***.com`). Error messages are redacted.
- **What it never touches:** existing users, clients or projects. It only reads the owner.
  - It only treats "Brightline Apparel (Demo)" as its own if the client's projects carry the marker `DEMO-SEED:live-demo:v1`: in the 3PL project's internal notes, and in the forwarder project's `field_sources`, which the app never shows.
  - A same-named client with other projects is refused.
- **Idempotent.** A re-run skips what exists. If a run fails partway it prints **PARTIAL RUN**, and the same command finishes the rest; or use `demo:remove`.
- **Removal is also a dry run first.** It deletes only the demo client and everything under it. That includes anything testers added there (extra 3PLs, a portal user made in Client access), which both dry runs list as "not from the seed" so you see it first.

## Commands

Run these from the repo, in a terminal on your own machine.

```sh
nvm use                                    # Node 22.18+ (the script runs the app's TypeScript directly)
export DEMO_TARGET_URL=https://vnidvcskfsyfytdjbiji.supabase.co
export DEMO_OWNER_EMAIL=<staff email>
read -rs DEMO_TARGET_SERVICE_KEY && export DEMO_TARGET_SERVICE_KEY    # paste the sb_secret_ key; nothing is echoed

npm run demo:live                                                                     # dry run
npm run demo:live -- --apply --confirm-project=vnidvcskfsyfytdjbiji --with-portal-user   # then type the ref

npm run demo:remove                                                                   # dry run of the removal
npm run demo:remove -- --apply --confirm-project=vnidvcskfsyfytdjbiji

unset DEMO_TARGET_SERVICE_KEY                                                         # and revoke the key in the dashboard
```

**To refresh the demo** (new dates, a new one-time password): `demo:remove`, then `demo:live` again.

**To try it locally first,** add `--local` and leave out `--confirm-project`. It reads the local stack from `npx supabase status` and refuses anything else. `DEMO_OWNER_EMAIL` can be `demo-expert1@demo.example.test` after `npm run demo:seed`. Then `npm run qa:portal-scan -- <app url>` also scans the demo client's portal, if its portal user exists.

**Local testing only:** `--fail-after=<step>` (`client`, `three-pl`, `providers`, `forwarders`, `updates`, `labels`, `report` or `requests`) stops a `--local --apply` run there on purpose, to check that a re-run finishes cleanly.
