// Target checks for the live demo client (scripts/demo/live-demo.mjs). Pure
// functions, unit-tested in live-demo-guard.test.mjs. Nothing here reads a
// file: the target comes from the environment variables the operator sets in
// their own terminal (never .env files), or from `npx supabase status` for
// the local stack.

export const PROD_REF = "vnidvcskfsyfytdjbiji";
export const DEMO_CLIENT_NAME = "Brightline Apparel (Demo)";
export const DEMO_MARKER = "DEMO-SEED:live-demo:v1";
export const DEMO_PORTAL_EMAIL = "brightline-demo@demo.example.test";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const LOCAL_PORT = "54321";
const HOSTED = /^https:\/\/([a-z]{20})\.supabase\.co\/?$/;
const FAIL_POINTS = ["client", "three-pl", "providers", "forwarders", "updates", "labels", "report", "requests"];

export class GuardError extends Error {}

const refuse = (message) => {
  throw new GuardError(message);
};

// --apply, --local, --confirm-project=<ref>, --with-portal-user,
// --fail-after=<step> (local only: a forced failure for testing re-runs).
export function parseArgs(argv) {
  const args = { command: "seed", apply: false, local: false, confirmProject: null, withPortalUser: false, failAfter: null };
  for (const a of argv) {
    if (a === "seed" || a === "remove") args.command = a;
    else if (a === "--apply") args.apply = true;
    else if (a === "--local") args.local = true;
    else if (a === "--with-portal-user") args.withPortalUser = true;
    else if (a.startsWith("--confirm-project=")) args.confirmProject = a.slice("--confirm-project=".length);
    else if (a.startsWith("--fail-after=")) args.failAfter = a.slice("--fail-after=".length);
    else refuse(`Unknown argument "${a}". See docs/qa/live-demo.md.`);
  }
  if (args.failAfter != null) {
    if (!args.local) refuse("--fail-after is only for testing against the local stack (--local).");
    if (!FAIL_POINTS.includes(args.failAfter)) refuse(`--fail-after must be one of: ${FAIL_POINTS.join(", ")}.`);
  }
  if (args.command === "remove" && args.withPortalUser) refuse("--with-portal-user is for seeding, not removal.");
  return args;
}

// Only the new secret API key (sb_secret_...). A legacy service_role JWT
// (eyJ...) is refused: it can't be revoked on its own, so it shouldn't be
// pasted into a terminal for a one-off script.
export function checkSecretKey(key) {
  if (!key) refuse("Set DEMO_TARGET_SERVICE_KEY to the project's secret API key (sb_secret_...).");
  if (key.startsWith("eyJ")) {
    refuse(
      "DEMO_TARGET_SERVICE_KEY looks like a legacy service_role JWT (starts with \"eyJ\"). Use a new secret API key " +
        "(sb_secret_..., Supabase dashboard -> Project Settings -> API Keys), which you can revoke on its own afterwards.",
    );
  }
  if (!key.startsWith("sb_secret_")) refuse("DEMO_TARGET_SERVICE_KEY must be a secret API key starting with sb_secret_.");
  return key;
}

export function maskEmail(email) {
  if (!email || !email.includes("@")) return "(none)";
  const [user, domain] = email.split("@");
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${user[0]}***@${host[0]}***${tld}`;
}

// Removes any secret from a message before it's printed.
export function redact(message, secrets) {
  let out = String(message ?? "");
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("[redacted]");
  return out;
}

// local: { url, secretKey } from `npx supabase status` when --local.
// env: DEMO_TARGET_URL, DEMO_TARGET_SERVICE_KEY, DEMO_OWNER_EMAIL.
export function resolveTarget(args, env, local) {
  const ownerEmail = (env.DEMO_OWNER_EMAIL ?? "").trim();
  if (!ownerEmail || !ownerEmail.includes("@")) refuse("Set DEMO_OWNER_EMAIL to the email of an existing staff user (logistics expert or admin).");

  if (args.local) {
    if (args.confirmProject) refuse("--confirm-project is for production; leave it out with --local.");
    if (!local) refuse("Couldn't read the local Supabase status. Start it with `npx supabase start`.");
    let url;
    try {
      url = new URL(local.url);
    } catch {
      refuse("The local Supabase status has no API URL.");
    }
    if (!LOCAL_HOSTS.has(url.hostname) || url.port !== LOCAL_PORT) {
      refuse(`--local refuses ${url.origin}: only the local stack (http://127.0.0.1:${LOCAL_PORT}) is allowed.`);
    }
    return { url: url.origin, key: checkSecretKey(local.secretKey), ref: "local", isLocal: true, ownerEmail };
  }

  const rawUrl = (env.DEMO_TARGET_URL ?? "").trim();
  if (!rawUrl) refuse("Set DEMO_TARGET_URL (https://<project-ref>.supabase.co), or use --local.");
  const match = HOSTED.exec(rawUrl);
  if (!match) refuse("DEMO_TARGET_URL must be exactly https://<project-ref>.supabase.co.");
  const ref = match[1];
  if (ref !== PROD_REF) refuse(`DEMO_TARGET_URL points at project ${ref}, not the production project this script is for.`);
  const key = checkSecretKey((env.DEMO_TARGET_SERVICE_KEY ?? "").trim());
  if (args.apply && args.confirmProject !== ref) {
    refuse(`--apply on production needs --confirm-project=${ref} (it must match DEMO_TARGET_URL).`);
  }
  return { url: `https://${ref}.supabase.co`, key, ref, isLocal: false, ownerEmail };
}

// The typed confirmation before writing to production.
export function confirmationMatches(typed, ref) {
  return String(typed ?? "").trim() === ref;
}
