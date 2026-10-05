// What a duty data source link points to, in words, so a reviewer knows
// before clicking whether it opens a web page, a PDF or a download. Display
// only; the stored URL never changes.

export type SourceLinkKind = "web page" | "PDF" | "download";

export type SourceLinkText = { name: string; kind: SourceLinkKind };

export function describeSourceLink(url: string): SourceLinkText {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { name: url, kind: "web page" };
  }
  const host = parsed.hostname.replace(/^www\./, "");

  if (host === "hts.usitc.gov") {
    if (parsed.pathname === "/search") {
      const query = parsed.searchParams.get("query");
      return { name: query ? `HTS website: ${query}` : "HTS website", kind: "web page" };
    }
    // USITC's file endpoint is served as application/octet-stream.
    if (parsed.pathname.startsWith("/reststop/")) return { name: "USITC HTS file", kind: "download" };
    return { name: "HTS website", kind: "web page" };
  }
  if (host === "federalregister.gov") {
    const doc = /\/(?:documents\/\d{4}\/\d{2}\/\d{2}|d)\/(\d{4}-\d+)/.exec(parsed.pathname);
    return { name: doc ? `Federal Register ${doc[1]}` : "Federal Register", kind: "web page" };
  }
  if (/\.pdf$/i.test(parsed.pathname)) return { name: host, kind: "PDF" };
  if (/\.(docx?|xlsx?|csv|zip)$/i.test(parsed.pathname)) return { name: host, kind: "download" };
  if (host === "cbp.gov" || host.endsWith(".cbp.gov")) return { name: "CBP", kind: "web page" };
  if (host === "ustr.gov") return { name: "USTR", kind: "web page" };
  return { name: host, kind: "web page" };
}

// "HTS website: 9903.88.01 (web page)"
export function sourceLinkText(url: string): string {
  const { name, kind } = describeSourceLink(url);
  return `${name} (${kind})`;
}
