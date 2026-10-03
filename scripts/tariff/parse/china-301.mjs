// China Section 301 from U.S. notes 20 and 31 (HTS chapter 99 PDF text,
// lines from notesLines()). Returns, per chapter 99 heading, the HTS lines
// it covers (8- or 10-digit, with excluded statistical numbers where the
// note says "except …"), and USTR's product exclusions.

import { block, blockText, digits, findLine, listCodes, location, parenItems, proseItems } from "./hts-notes.mjs";

const lineOf = (code, loc, extra = {}) => ({ code, prefix: digits(code), location: loc, ...extra });

// "1. …, provided for in subheading 4901.99.00, except … 4901.99.0040" →
// the covered code plus excluded statistical-number lines.
function proseLines(items) {
  const out = [];
  for (const item of items) {
    out.push(lineOf(item.covered, item.location));
    for (const ex of item.excepted) {
      if (!digits(ex).startsWith(digits(item.covered))) {
        throw new Error(`${item.location}: excepted ${ex} isn't under ${item.covered}`);
      }
      out.push(lineOf(ex, item.location, { excluded: true }));
    }
  }
  return out;
}

export function chinaLists(lines) {
  const n20 = findLine(lines, "20. (a) For the purposes of heading 9903.88.01");
  const n31 = findLine(lines, "31. (a) As provided in headings 9903.91.01");
  const lists = {};

  lists["9903.88.01"] = listCodes(
    block(lines, "(b) Heading 9903.88.01 applies", "(c) For the purposes of heading 9903.88.02", n20).lines,
    "20(b)",
  );
  lists["9903.88.02"] = listCodes(
    block(lines, "(d) Heading 9903.88.02 applies", "(e) For the purposes of heading 9903.88.03", n20).lines,
    "20(d)",
  );
  lists["9903.88.03"] = listCodes(
    block(lines, "(f) Heading 9903.88.03 applies", "(g) For the purposes of heading 9903.88.04", n20).lines,
    "20(f)",
  );
  lists["9903.88.04"] = proseLines(
    proseItems(block(lines, "(g) For the purposes of heading 9903.88.04", "(h) The U.S. Trade Representative", n20).lines, "20(g)"),
  );
  const s = findLine(lines, "(s) Heading 9903.88.15 applies to:", n20);
  lists["9903.88.15"] = [
    ...listCodes(block(lines, "(i) all products of China", "(ii) the following products of China:", s).lines, "20(s)(i)"),
    ...proseLines(proseItems(block(lines, "(ii) the following products of China:", "(t) For the purposes of heading 9903.88.16", s).lines, "20(s)(ii)")),
  ];

  const b31 = block(lines, "(b) Heading 9903.91.01 applies", "(c) Heading 9903.91.02 applies", n31);
  lists["9903.91.01"] = listCodes(b31.lines, "31(b)");
  // The compiler's note states the count: "numbered … as numbers (5)
  // through (352)".
  const numbered = /numbers \((\d+)\) through \((\d+)\)/.exec(blockText(b31.lines));
  const stated31b = numbered ? Number(numbered[2]) - Number(numbered[1]) + 1 : null;
  lists["9903.91.02"] = listCodes(block(lines, "(c) Heading 9903.91.02 applies", "(d) Heading 9903.91.03 applies", n31).lines, "31(c)");
  lists["9903.91.03"] = listCodes(block(lines, "(d) Heading 9903.91.03 applies", "(e) Heading 9903.91.04 applies", n31).lines, "31(d)");
  lists["9903.91.05"] = listCodes(
    block(lines, "(i) Heading 9903.91.05 applies", "(ii) The additional rate of duty under heading 9903.91.05", n31).lines,
    "31(f)(i)",
  );
  lists["9903.91.06"] = listCodes(block(lines, "(g) Heading 9903.91.06 applies", "(h) Heading 9903.91.07 applies", n31).lines, "31(g)");
  // (h): 10-digit statistical numbers named in prose.
  const h = block(lines, "(h) Heading 9903.91.07 applies", "(i) Heading 9903.91.08 applies", n31);
  lists["9903.91.07"] = parenItems(h.lines).flatMap((item) =>
    [...item.text.matchAll(/\b(\d{4}\.\d{2}\.\d{4})\b/g)].map((m) => lineOf(m[1], `${location(item.line, "31(h)")}, item ${item.n}`)),
  );
  const i = block(lines, "(i) Heading 9903.91.08 applies", "(j) Heading 9903.91.11 applies", n31);
  lists["9903.91.08"] = [...blockText(i.lines).matchAll(/8-digit subheading (\d{4}\.\d{2}\.\d{2})/g)].map((m) =>
    lineOf(m[1], location(i.lines[0], "31(i)")),
  );
  lists["9903.91.11"] = listCodes(block(lines, "(j) Heading 9903.91.11 applies", "(k)", n31).lines, "31(j)");

  // (k)(i) chassis and (l)(i) cranes take effect November 10, 2026 (loaded
  // as unconfirmed); 9903.92.10 cranes are named in the heading itself.
  const k = block(lines, "(i) Heading 9903.91.12 applies", "(ii) Heading 9903.91.13 applies", n31);
  const chassis = [...blockText(k.lines).slice(0, 400).matchAll(/\b(\d{4}\.\d{2}\.\d{2}(?:\d{2})?)\b/g)]
    .filter((m) => !m[1].startsWith("99"))
    .map((m) => lineOf(m[1], location(k.lines[0], "31(k)(i)")));
  const l = findLine(lines, "(i) Heading 9903.91.14 applies", n31);
  const cranes = [lineOf("8426.19.00", location(lines[l], "31(l)(i)"))];

  return { lists, chassis, cranes, stated: { "9903.91.01": stated31b } };
}

// Statistical numbers an exclusion covers today: clauses ending "prior to
// <date>" or "… through <date>" are history; the rest are current.
export function currentCodes(text) {
  const clauses = text.split(";");
  const current = clauses.filter((c) => !/prior to|through/.test(c));
  const use = current.length > 0 ? current : clauses;
  const codes = [];
  for (const c of use) {
    for (const m of c.matchAll(/\b(\d{4}\.\d{2}\.\d{2}(?:\d{2})?)\b/g)) if (!m[1].startsWith("99")) codes.push(m[1]);
  }
  return [...new Set(codes)];
}

export function articleDescription(text) {
  const cut = text.search(/\s*\((?:described|provided for) in /);
  const head = (cut > 0 ? text.slice(0, cut) : text).trim();
  return /^\d{4}\.\d{2}\.\d{2,4}\b/.test(head) ? null : head;
}

// U.S. note 20(vvv)(i)-(iv) (heading 9903.88.69) and 20(www) (9903.88.70).
// Each item becomes one or more lines carrying the item's text, so a match
// is only ever "may qualify for an exclusion if the article is …".
export function chinaExclusions(lines) {
  const n20 = findLine(lines, "20. (a) For the purposes of heading 9903.88.01");
  const vvv = findLine(lines, "(vvv) (i) The U.S. Trade Representative", n20);
  const subs = [
    { sub: "vvv(i)", ref: "20(vvv)(i)", from: "(vvv) (i) The U.S. Trade Representative", to: "(ii) The U.S. Trade Representative", heading: "9903.88.69", list: "9903.88.01" },
    { sub: "vvv(ii)", ref: "20(vvv)(ii)", from: "(ii) The U.S. Trade Representative", to: "(iii) The U.S. Trade Representative", heading: "9903.88.69", list: "9903.88.02" },
    { sub: "vvv(iii)", ref: "20(vvv)(iii)", from: "(iii) The U.S. Trade Representative", to: "(iv) The U.S. Trade Representative", heading: "9903.88.69", list: "9903.88.03/.04" },
    { sub: "vvv(iv)", ref: "20(vvv)(iv)", from: "(iv) The U.S. Trade Representative", to: "(www) The U.S. Trade Representative", heading: "9903.88.69", list: "9903.88.15" },
    // Revision 20 prints the start of note 21 as "(21)(a)", not "21. (a)":
    // ending (www) at "21. (a)" would run into note 21's own items.
    { sub: "www", ref: "20(www)", from: "(www) The U.S. Trade Representative", to: "(21)(a)", heading: "9903.88.70", list: "9903.88.02" },
  ];
  const out = [];
  let from = vvv;
  for (const s of subs) {
    const b = block(lines, s.from, s.to, from);
    from = b.end;
    for (const item of parenItems(b.lines)) {
      const codes = currentCodes(item.text);
      if (codes.length === 0) throw new Error(`${s.ref}(${item.n}): no statistical number`);
      out.push({ ...s, n: item.n, text: item.text, codes, description: articleDescription(item.text), location: `${location(item.line, s.ref)}, item ${item.n}` });
    }
  }
  return out;
}
