import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge, type ProviderStatus } from "../status-badge";
import { UploadProviderDocumentForm } from "./upload-form";

const BUCKET = "3pl-sourcing-documents";
const SIGNED_URL_EXPIRY_SECONDS = 60;

type ProviderDocumentType =
  | "discovery_transcript"
  | "notes"
  | "document"
  | "quotation"
  | "revised_quotation";

type ProviderDocumentRow = {
  id: string;
  file_name: string;
  file_path: string;
  type: ProviderDocumentType;
  uploaded_at: string;
};

const GROUPS: { type: ProviderDocumentType; title: string }[] = [
  { type: "discovery_transcript", title: "Discovery Call Transcript" },
  { type: "notes", title: "Notes" },
  { type: "document", title: "Documents" },
  { type: "quotation", title: "Quotation" },
  { type: "revised_quotation", title: "Revised Quotation" },
];

export default async function ProviderDetailsPage({
  params,
}: PageProps<"/projects/[id]/providers/[providerId]">) {
  const { id, providerId } = await params;

  const supabase = await createClient();

  const { data: provider } = await supabase
    .from("providers")
    .select(
      "id, company_name, website, contact_person, email, phone, location, notes, status",
    )
    .eq("id", providerId)
    .eq("project_id", id)
    .single();

  if (!provider) {
    notFound();
  }

  const { data: documents } = await supabase
    .from("provider_documents")
    .select("id, file_name, file_path, type, uploaded_at")
    .eq("provider_id", providerId)
    .order("uploaded_at", { ascending: false });

  const docsByType = new Map<ProviderDocumentType, ProviderDocumentRow[]>();
  for (const group of GROUPS) docsByType.set(group.type, []);
  for (const doc of (documents ?? []) as ProviderDocumentRow[]) {
    docsByType.get(doc.type)?.push(doc);
  }

  const signedUrls = new Map<string, string>();
  for (const doc of (documents ?? []) as ProviderDocumentRow[]) {
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, SIGNED_URL_EXPIRY_SECONDS);
    if (data?.signedUrl) {
      signedUrls.set(doc.id, data.signedUrl);
    }
  }

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href={`/projects/${id}/providers`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to 3PL List
      </Link>

      <div className="mt-2 mb-8 flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-move-navy">
          {provider.company_name}
        </h1>
        <StatusBadge status={provider.status as ProviderStatus} />
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
          Provider Info
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-neutral-muted">Website</dt>
            <dd className="text-sm text-move-navy">
              {provider.website || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-muted">Contact Person</dt>
            <dd className="text-sm text-move-navy">
              {provider.contact_person || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-muted">Email</dt>
            <dd className="text-sm text-move-navy">{provider.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-muted">Phone</dt>
            <dd className="text-sm text-move-navy">{provider.phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-muted">Location</dt>
            <dd className="text-sm text-move-navy">
              {provider.location || "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-neutral-muted">Notes</dt>
            <dd className="text-sm text-move-navy">{provider.notes || "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
          Upload Document
        </h2>
        <UploadProviderDocumentForm projectId={id} providerId={providerId} />
      </div>

      <div className="flex flex-col gap-6">
        {GROUPS.map((group) => {
          const docs = docsByType.get(group.type) ?? [];
          return (
            <div
              key={group.type}
              className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm"
            >
              <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
                {group.title}
              </h2>

              {docs.length === 0 ? (
                <p className="text-sm text-neutral-muted">
                  No documents uploaded yet
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {docs.map((doc) => {
                    const signedUrl = signedUrls.get(doc.id);
                    return (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between border-b border-neutral-border pb-3 last:border-b-0 last:pb-0"
                      >
                        <div>
                          <p className="text-sm text-move-navy">
                            {doc.file_name}
                          </p>
                          <p className="text-xs text-neutral-muted">
                            {new Date(doc.uploaded_at).toLocaleDateString()}
                          </p>
                        </div>
                        {signedUrl ? (
                          <a
                            href={signedUrl}
                            className="text-sm font-medium text-move-green hover:underline"
                          >
                            Download
                          </a>
                        ) : (
                          <span className="text-sm text-neutral-muted">
                            Unavailable
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
