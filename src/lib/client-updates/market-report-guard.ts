// "Move's take" is the one free text in a Market Report. It's refused if it
// contains anything that could identify ANY partner in the project (named or
// not): words of the company name, the HQ city (as a phrase), the website
// or email domain, or the contact person's name. And it may not use Move's
// internal status words. Generic words ("logistics", "freight", "sales")
// don't count as identifying. Server-side, before preview and again at
// publish.

export type PartnerIdentity = {
  id: string;
  company_name: string;
  website: string | null;
  headquarters: string | null;
  email: string | null;
  contact_person: string | null;
};

// Words common to many company names, places and contact roles: on their
// own they identify nobody.
const GENERIC = new Set(
  [
    "the", "and", "for", "of", "co", "inc", "ltd", "llc", "corp", "corporation", "company", "group", "holdings",
    "international", "intl", "global", "worldwide", "logistics", "logistic", "freight", "forwarding", "forwarders",
    "forwarder", "shipping", "cargo", "lines", "line", "express", "transport", "transportation", "services",
    "service", "solutions", "supply", "chain", "trading", "agency", "agents", "sea", "air", "ocean", "land",
    "sales", "desk", "team", "ops", "operations", "office", "department", "dept", "manager", "support", "info",
    "contact", "booking", "bookings", "export", "import", "imports", "exports", "customer", "account", "accounts",
    "city", "www", "com", "net", "org", "example",
  ],
);

// Internal status and assessment words never reach a client.
const INTERNAL_WORDS = [
  "unfit",
  "do not contact",
  "withdrawn",
  "no response",
  "vetted",
  "under assessment",
  "move recommended",
  "reviewing quotation",
  "waiting for quotation",
  "not contacted",
  "blacklist",
];

// Lower case without accents ("Tomás" -> "tomas").
function normalise(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function words(value: string | null): string[] {
  return normalise(value ?? "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !GENERIC.has(w));
}

function host(value: string | null): string | null {
  if (!value) return null;
  const raw = value.includes("@") ? value.split("@").pop()! : value;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// The domain without its last part: "pacificbridge.example" -> "pacificbridge".
function domainName(value: string | null): string | null {
  const h = host(value);
  if (!h) return null;
  const parts = h.split(".");
  const name = (parts.length > 1 ? parts.slice(0, -1) : parts).join(".");
  return name.length >= 4 ? name : null;
}

export type IdentifyingTokens = { words: Set<string>; phrases: Set<string>; compact: Set<string> };

export function identifyingTokens(p: PartnerIdentity): IdentifyingTokens {
  // The HQ city as a whole phrase ("can tho", "ho chi minh"): its words on
  // their own are often ordinary words.
  const city = normalise(p.headquarters?.split(",")[0] ?? "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && w !== "city")
    .join(" ");
  const compact = new Set<string>();
  for (const d of [domainName(p.website), domainName(p.email)]) {
    if (d) {
      compact.add(d.replace(/[^a-z0-9]/g, ""));
      for (const w of words(d)) compact.add(w);
    }
  }
  const nameCompact = p.company_name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (nameCompact.length >= 5) compact.add(nameCompact);
  return {
    words: new Set([...words(p.company_name), ...words(p.contact_person)]),
    phrases: new Set(city.length >= 3 ? [city] : []),
    compact,
  };
}

export type GuardHit = { partnerId: string; partnerName: string; token: string } | { internalWord: string };

// The first thing in the text that identifies a partner or is an internal
// status word, or null if the text is fine.
export function findIdentifying(take: string, partners: PartnerIdentity[]): GuardHit | null {
  const lower = normalise(take);
  for (const w of INTERNAL_WORDS) {
    if (lower.includes(w)) return { internalWord: w };
  }
  const textWords = new Set(lower.split(/[^a-z0-9]+/).filter(Boolean));
  const textCompact = lower.replace(/[^a-z0-9]/g, "");
  const textPhrase = ` ${lower.split(/[^a-z0-9]+/).filter(Boolean).join(" ")} `;
  for (const p of partners) {
    const tokens = identifyingTokens(p);
    for (const w of tokens.words) {
      if (textWords.has(w)) return { partnerId: p.id, partnerName: p.company_name, token: w };
    }
    for (const phrase of tokens.phrases) {
      if (textPhrase.includes(` ${phrase} `)) return { partnerId: p.id, partnerName: p.company_name, token: phrase };
    }
    for (const c of tokens.compact) {
      if (c.length >= 4 && textCompact.includes(c)) return { partnerId: p.id, partnerName: p.company_name, token: c };
    }
  }
  return null;
}
