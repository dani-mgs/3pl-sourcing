// Text for pdfkit's built-in Helvetica, which draws Windows-1252 only
// (WinAnsiEncoding): printable ASCII, Latin-1 (accents, "·", "×", "³") and
// the 27 extra Windows-1252 characters (€ … — – ‘ ’ “ ” • ™ …). Anything else
// (arrows, CJK, emoji) would print as garbage. Our own wording uses words
// for the few symbols it has; text people typed keeps what can be drawn and
// shows "?" for the rest, which the PDF then mentions once. Embedding a
// Unicode font would lift this (TECH_DEBT). Pure.

const WIN_ANSI_EXTRAS = new Set(
  [0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
   0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178],
);

export function isDrawable(char: string): boolean {
  const code = char.codePointAt(0)!;
  return char === "\n" || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.has(code);
}

// Our own symbols, as words.
const OWN_SYMBOLS: [RegExp, string][] = [
  [/→/g, " to "],
  [/←/g, " from "],
  [/≤/g, "up to "],
  [/≥/g, "at least "],
  [/−/g, "-"],
  [/✓/g, "yes"],
  [/ /g, " "],
];

export type PdfText = {
  // Our wording: symbols as words. Anything still not drawable is a bug,
  // caught by tests; shown as "?" rather than garbage.
  own: (text: string) => string;
  // What people typed: "?" for each character the font can't draw.
  user: (text: string | null | undefined) => string;
  // Whether any character was replaced (the PDF then says so once).
  replaced: () => boolean;
};

function draw(text: string, onReplace: () => void): string {
  let out = "";
  for (const char of text.normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, " ")) {
    if (isDrawable(char)) out += char;
    else {
      out += "?";
      onReplace();
    }
  }
  return out;
}

export function pdfText(): PdfText {
  let replaced = false;
  const flag = () => {
    replaced = true;
  };
  return {
    own: (text) => draw(OWN_SYMBOLS.reduce((t, [pattern, word]) => t.replace(pattern, word), text), () => {}),
    user: (text) => draw(text ?? "", flag),
    replaced: () => replaced,
  };
}

// Our wording that the font can't draw as is (for tests): empty means fine.
export function undrawable(text: string): string[] {
  return [...new Set([...text.normalize("NFC")].filter((c) => !isDrawable(c) && c !== "\t" && c !== "\r"))];
}

export const CHARACTERS_NOTE = "Some characters couldn't be shown in this PDF.";
