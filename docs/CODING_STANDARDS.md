# CODING_STANDARDS

## Coding Standards

A lightweight standards doc for small-to-medium projects. Goal: code that's easy to maintain, easy to hand off, and doesn't over-engineer for a problem that doesn't exist yet.

## 1. Project Structure

```
project-root/
├── src/
│   ├── components/   # UI pieces, one responsibility each
│   ├── lib/          # shared logic, helpers, API clients
│   ├── pages/ (or app/)  # routes
│   └── styles/
├── public/
├── docs/
│   ├── CHANGELOG.md
│   └── FEATURES/     # one short doc per feature (optional, see §5)
├── .env.example
├── README.md
└── CODING_STANDARDS.md  # this file
```

Rule of thumb: if you can't say what a folder is for in one sentence, it's organized wrong.

## 2. Naming Conventions

| What | Convention | Example |
|---|---|---|
| Files (components) | PascalCase | `UserCard.jsx` |
| Files (utils/config) | kebab-case | `date-utils.js` |
| Variables/functions | camelCase | `getUserProfile()` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Components | PascalCase | `<UserCard />` |
| CSS classes | kebab-case | `.user-card` |

Be consistent even when you disagree with the convention — consistency beats personal preference.

## 3. Code Organization Rules

- One responsibility per function. If a function needs "and" to describe what it does, split it.
- Files under ~200 lines as a soft ceiling. Past that, look for a natural split.
- No premature abstraction. Don't build a plugin system, config layer, or generic utility for a single use case. Solve today's problem; refactor when a second use case actually appears.
- Separate concerns: UI rendering, business logic, and data access shouldn't live in the same function, even in a small app. They can live in the same file if the file is short — just keep the logic separable.
- Centralize config: all environment variables and constants pulled from one place (e.g. `lib/config.js`), never hardcoded inline.
- Never commit secrets. `.env` in `.gitignore`, `.env.example` checked in with placeholder values.

## 4. Comments & Readability

- Comment why, not what. `// retry 3x because the upstream API rate-limits aggressively` is useful. `// loop through users` is not.
- Prefer a clear variable/function name over a comment explaining an unclear one.
- Leave a short comment on anything non-obvious: a workaround, a magic number, an ordering dependency.

## 5. Documentation — After Every Feature

Every feature/PR gets two things updated, no more:

1. `docs/CHANGELOG.md` — one entry, 3–5 lines:

   ```
   ## [Unreleased]
   ### Added
   - Short description of what changed and why it matters to a user. Any breaking change or migration note goes here.
   ```

2. `README.md` — only if the feature changes how someone uses or runs the project (new env var, new command, new setup step). If it's purely internal, skip the README.

Optional (use if the feature is complex enough to need it): a one-page doc in `docs/FEATURES/feature-name.md` covering what it does, how to use it, and any gotchas — max ~150 words. Don't create one of these for trivial features; that's noise, not documentation.

Do not write documentation that just restates the code. Documentation answers "what does this do for the user/dev" and "why does it exist," not "here is a list of every function."

## 6. Version Control

- Commit messages follow a lightweight Conventional Commits style:
  - `feat: add user profile page`
  - `fix: correct date formatting on invoice`
  - `docs: update README setup steps`
  - `refactor: split UserCard into smaller components`
- One logical change per commit. Avoid "fix stuff" commits covering five unrelated things.
- Branch per feature/fix; short-lived branches, merge back promptly.

## 7. Dependencies

- Before adding a new package, ask: can this be done in ~20 lines of plain code? If yes, don't add the dependency.
- Any new dependency added should have a one-line justification in the commit message or PR description.
- Periodically check for unused dependencies (depcheck or similar) — don't let package.json accumulate dead weight.

## 8. Error Handling & Security Basics

- Validate input at the boundary (form submission, API route) — don't trust client data.
- Fail loudly in development (clear error messages), fail gracefully in production (no stack traces shown to users).
- Never log sensitive data (passwords, tokens, full user records) even in dev.
- Auth/permission checks belong on the server side, never only in the UI.

## 9. Testing (right-sized)

Small projects don't need full test suites to be "doing it right." Prioritize:

- A manual test checklist per feature (documented in the PR or feature doc): what to click, what should happen.
- Automated tests only for logic that's easy to get subtly wrong (calculations, data transforms, auth rules) — not for simple UI rendering.
- If you don't have automated tests yet, that's fine — just be honest about it in the docs rather than pretending coverage exists.

## 10. When in Doubt

Pick the boring, obvious solution over the clever one. Small projects are maintained by future-you (or someone else) reading the code cold — optimize for that person's ability to understand it in five minutes, not for elegance.
