// PR 2a: origin-based Section 301 duties (forced labour, Brazil), from
//   - the HTS chapter 99 export (headings 9903.05.20-.84: rate per origin);
//   - U.S. note 52 as published in FR 2026-15181 (forced labour);
//   - U.S. note 50 as published in FR 2026-14542 (Brazil).
// Pure: takes the texts, returns duty rows with their scope lines.

export const FL_FR =
  "https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies";
export const BR_FR =
  "https://www.federalregister.gov/documents/2026/07/20/2026-14542/notice-of-action-brazils-acts-policies-and-practices-related-to-digital-trade-and-electronic-payment";

const EXCL_232 = [
  "section_232_metals",
  "section_232_vehicles",
  "section_232_timber",
  "section_232_semiconductors",
  "section_232_pharmaceuticals",
];
export const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
const ISO = {
  Algeria: "DZ", Angola: "AO", Argentina: "AR", Australia: "AU", "the Bahamas": "BS", Bahrain: "BH", Bangladesh: "BD",
  Brazil: "BR", Cambodia: "KH", Canada: "CA", Chile: "CL", China: "CN", Colombia: "CO", "Costa Rica": "CR",
  "Dominican Republic": "DO", Ecuador: "EC", Egypt: "EG", "El Salvador": "SV", Guatemala: "GT", Guyana: "GY",
  Honduras: "HN", "Hong Kong, China": "HK", India: "IN", Indonesia: "ID", Iraq: "IQ", Israel: "IL", Japan: "JP",
  Jordan: "JO", Kazakhstan: "KZ", Kuwait: "KW", Libya: "LY", Malaysia: "MY", Mexico: "MX", Morocco: "MA",
  "New Zealand": "NZ", Nicaragua: "NI", Nigeria: "NG", Norway: "NO", Oman: "OM", Pakistan: "PK", Peru: "PE",
  "the Philippines": "PH", Qatar: "QA", Russia: "RU", "Saudi Arabia": "SA", Singapore: "SG", "South Africa": "ZA",
  "South Korea": "KR", "Sri Lanka": "LK", Switzerland: "CH", Taiwan: "TW", Thailand: "TH", "Trinidad and Tobago": "TT",
  Türkiye: "TR", "the United Arab Emirates": "AE", "the United Kingdom": "GB", Uruguay: "UY", Venezuela: "VE", Vietnam: "VN",
};

const digits = (code) => code.replace(/\./g, "");

// Python's str.find + slice semantics, which the original generator used:
// a missing end marker (-1) drops the last character.
function between(text, start, end) {
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  return text.slice(i, j === -1 ? -1 : j);
}

// The note texts inside the Federal Register notices (already normalized by
// federalRegisterText).
export function note52Text(frText) {
  const start = frText.indexOf("``52. (a)");
  const endMarker = "(8) patented pharmaceutical articles provided for in headings 9903.04.60-9903.04.66.''";
  const end = frText.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("U.S. note 52 not found in FR 2026-15181");
  return frText.slice(start, end + endMarker.length);
}

export function note50Text(frText) {
  const start = frText.indexOf("50. (a) (i) Except as provided in headings 9903.05.02");
  if (start < 0) throw new Error("U.S. note 50 not found in FR 2026-14542");
  return frText.slice(start);
}

// "(n) Description (classifiable in subheading XXXX.XX.XX)" items.
export function particulars(text) {
  return [...text.matchAll(/\((?:\d+|[A-Z])\)\s*(.+?)\s*\(classifiable in subheading (\d{4}\.\d{2}\.\d{2,4})\)/g)].map((m) => ({
    prefix: digits(m[2]),
    description: m[1].trim().replace(/;$/, "").trim(),
  }));
}

export function originDuties({ ch99, note52, note50, checkedOn }) {
  const duties = [];
  const base = {
    authority: "section_301",
    chapter99_heading_at_minimum: null,
    condition_text: null,
    assume_condition: false,
    excludes_programs: [],
    exclusion_heading: null,
    filing_order: 10,
    effective_to: null,
    legal_status: "in_force",
    source_checked_on: checkedOn,
    notes: null,
    lines: [],
  };
  const fl = (d) =>
    duties.push({ ...base, program_key: "section_301_forced_labor", effective_from: "2026-07-24", source_url: FL_FR, ...d });

  // Flat rates per origin, from the headings.
  for (const x of ch99) {
    const h = x.htsno ?? "";
    if (!h.startsWith("9903.05.")) continue;
    const n = Number(h.split(".")[2]);
    if (n < 20 || n > 84) continue;
    const name = /articles the product of (.+?)(?:, with an|, as provided)/.exec(x.description)?.[1];
    const rate = /^The duty provided in the applicable subheading \+ ([\d.]+)%$/.exec(x.general.trim())?.[1];
    if (!name || name.startsWith("a member state") || !rate) continue;
    const code = ISO[name];
    if (!code) throw new Error(`No ISO code for ${name} (${h})`);
    fl({
      chapter99_heading: h,
      label: name.startsWith("the ") ? name.slice(4) : name,
      rate_type: "add",
      rate_pct: rate,
      origin_countries: [code],
      hts_scope: "all",
      excludes_programs: EXCL_232,
      exclusion_heading: "9903.05.90",
      source_label: `HTS heading ${h} (2026 Rev. 20) and U.S. note 52(a), FR 2026-15181`,
    });
  }

  // Minimum total (note 52(k)).
  for (const [atMin, h, label, origins, rate] of [
    ["9903.05.38", "9903.05.39", "EU member states", EU, "10"],
    ["9903.05.48", "9903.05.49", "Japan", ["JP"], "12.5"],
    ["9903.05.70", "9903.05.71", "South Korea", ["KR"], "12.5"],
    ["9903.05.73", "9903.05.74", "Switzerland", ["CH"], "12.5"],
    ["9903.05.75", "9903.05.76", "Taiwan", ["TW"], "10"],
  ]) {
    fl({
      chapter99_heading: h,
      chapter99_heading_at_minimum: atMin,
      label,
      rate_type: "minimum_total",
      rate_pct: rate,
      origin_countries: origins,
      hts_scope: "all",
      excludes_programs: EXCL_232,
      exclusion_heading: "9903.05.90",
      source_label: `HTS headings ${atMin}/${h} and U.S. note 52(k), FR 2026-15181`,
      notes:
        "Column 1 rate + additional = at least the minimum; specific or compound rates use the ad valorem equivalent (duty / customs value), note 52(k).",
    });
  }

  // Particular articles of any covered origin (note 52(c)).
  const cItems = particulars(between(note52, "(c) As provided in heading 9903.05.87", "(d) As provided"));
  if (cItems.length !== 16) throw new Error(`note 52(c): expected 16 articles, found ${cItems.length}`);
  fl({
    chapter99_heading: "9903.05.87",
    label: "Particular articles (any covered origin)",
    rate_type: "exempt",
    rate_pct: null,
    origin_countries: null,
    hts_scope: "listed",
    source_label: "U.S. note 52(c), FR 2026-15181",
    lines: cItems.map((l) => ({ ...l, location: "FR 2026-15181, U.S. note 52(c)" })),
  });

  for (const [h, origins, label, condition] of [
    ["9903.05.93", ["CA"], "USMCA goods of Canada", "the goods are entered free of duty under the USMCA (U.S. note 52(g))"],
    ["9903.05.94", ["MX"], "USMCA goods of Mexico", "the goods are entered free of duty under the USMCA (U.S. note 52(h))"],
    [
      "9903.05.95",
      ["CR", "DO", "SV", "GT", "HN", "NI"],
      "CAFTA-DR textile and apparel goods",
      "the good is a textile or apparel good (general note 29(d)(v)) entered free of duty under CAFTA-DR (U.S. note 52(i))",
    ],
  ]) {
    fl({
      chapter99_heading: h,
      label,
      rate_type: "exempt",
      rate_pct: null,
      origin_countries: origins,
      hts_scope: "all",
      condition_text: condition,
      source_label: "U.S. note 52, FR 2026-15181",
    });
  }

  // Particular articles per country (note 52(j)(ii)).
  for (const [h, code, name] of [
    ["9903.06.01", "MY", "Malaysia"],
    ["9903.06.03", "KH", "Cambodia"],
    ["9903.06.05", "GT", "Guatemala"],
    ["9903.06.08", "SV", "El Salvador"],
    ["9903.06.11", "AR", "Argentina"],
    ["9903.06.13", "BD", "Bangladesh"],
    ["9903.06.15", "TW", "Taiwan"],
    ["9903.06.17", "ID", "Indonesia"],
    ["9903.06.19", "EC", "Ecuador"],
    ["9903.06.21", "JO", "Jordan"],
  ]) {
    const i = note52.indexOf(`As provided in heading ${h},`);
    if (i < 0) throw new Error(`note 52(j): ${h} not found`);
    const j = note52.indexOf("As provided in heading", i + 10);
    const items = particulars(note52.slice(i, j === -1 ? -1 : j));
    if (items.length === 0) throw new Error(`note 52(j): no articles for ${h}`);
    fl({
      chapter99_heading: h,
      label: `Particular articles of ${name}`,
      rate_type: "exempt",
      rate_pct: null,
      origin_countries: [code],
      hts_scope: "listed",
      source_label: "U.S. note 52(j), FR 2026-15181",
      lines: items.map((l) => ({ ...l, location: `FR 2026-15181, U.S. note 52(j), heading ${h}` })),
    });
  }

  // Brazil (note 50).
  const br = (d) => duties.push({ ...base, program_key: "section_301_brazil", effective_from: "2026-07-22", source_url: BR_FR, ...d });
  br({
    chapter99_heading: "9903.05.01",
    label: "Brazil",
    rate_type: "add",
    rate_pct: "25",
    origin_countries: ["BR"],
    hts_scope: "all",
    excludes_programs: EXCL_232,
    exclusion_heading: "9903.05.07",
    source_label: "HTS heading 9903.05.01 and U.S. note 50(a)(i), FR 2026-14542",
  });
  const codesBetween = (a, b) =>
    [...between(note50, a, b).matchAll(/\b\d{4}\.\d{2}\.\d{2,4}\b/g)]
      .map((m) => m[0])
      .filter((c) => !c.startsWith("98") && !c.startsWith("99"))
      .map(digits);
  const ii = codesBetween("(ii) As provided", "(iii) As provided");
  const iv = codesBetween("(iv) As provided", "(v) As provided");
  const v = codesBetween("(v) As provided", "(vi) As provided");
  const iii = particulars(between(note50, "(iii) As provided", "(iv) As provided"));
  const counts = [ii.length, iv.length, v.length, iii.length].join(",");
  if (counts !== "864,540,705,11") throw new Error(`note 50: unexpected list sizes ${counts}`);
  const loc = (sub) => (l) => ({ ...l, location: `FR 2026-14542, U.S. note 50(a)(${sub})` });
  const plain = (codes) => codes.map((prefix) => ({ prefix, description: null }));
  br({
    chapter99_heading: "9903.05.03",
    label: "Listed subheadings",
    rate_type: "exempt",
    rate_pct: null,
    origin_countries: ["BR"],
    hts_scope: "listed",
    source_label: "U.S. note 50(a)(ii), FR 2026-14542",
    lines: plain(ii).map(loc("ii")),
  });
  br({
    chapter99_heading: "9903.05.04",
    label: "Particular articles",
    rate_type: "exempt",
    rate_pct: null,
    origin_countries: ["BR"],
    hts_scope: "listed",
    source_label: "U.S. note 50(a)(iii), FR 2026-14542",
    lines: iii.map(loc("iii")),
  });
  br({
    chapter99_heading: "9903.05.05",
    label: "Civil aircraft and parts",
    rate_type: "exempt",
    rate_pct: null,
    origin_countries: ["BR"],
    hts_scope: "listed",
    condition_text:
      "the article is a civil aircraft, or an engine, part, component, subassembly or ground flight simulator of one, meeting general note 6 (U.S. note 50(a)(iv))",
    source_label: "U.S. note 50(a)(iv), FR 2026-14542",
    lines: plain(iv).map(loc("iv")),
  });
  br({
    chapter99_heading: "9903.05.06",
    label: "Pharmaceutical-use articles",
    rate_type: "exempt",
    rate_pct: null,
    origin_countries: ["BR"],
    hts_scope: "listed",
    condition_text: "the article is for use in pharmaceutical applications (U.S. note 50(a)(v))",
    source_label: "U.S. note 50(a)(v), FR 2026-14542",
    lines: plain(v).map(loc("v")),
  });
  return duties;
}
