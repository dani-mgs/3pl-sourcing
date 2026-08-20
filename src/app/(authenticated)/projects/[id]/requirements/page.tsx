import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";
import { DeleteDocumentButton } from "./delete-document-button";

const BUCKET = "3pl-sourcing-documents";
const SIGNED_URL_EXPIRY_SECONDS = 60;

type DocumentType = "rfi" | "kickoff_transcript" | "other";

type DocumentRow = {
  id: string;
  file_name: string;
  file_path: string;
  type: DocumentType;
  uploaded_at: string;
};

const GROUPS: { type: DocumentType; title: string }[] = [
  { type: "rfi", title: "RFI" },
  { type: "kickoff_transcript", title: "Kickoff Meeting Transcript" },
  { type: "other", title: "Other Documents" },
];

export default async function RequirementsPage({
  params,
}: PageProps<"/projects/[id]/requirements">) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id")
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isOwner = user?.id === project.owner_id;

  const { data: documents } = await supabase
    .from("documents")
    .select("id, file_name, file_path, type, uploaded_at")
    .eq("project_id", id)
    .order("uploaded_at", { ascending: false });

  const docsByType = new Map<DocumentType, DocumentRow[]>();
  for (const group of GROUPS) docsByType.set(group.type, []);
  for (const doc of (documents ?? []) as DocumentRow[]) {
    docsByType.get(doc.type)?.push(doc);
  }

  const signedUrls = new Map<string, string>();
  for (const doc of (documents ?? []) as DocumentRow[]) {
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.file_path, SIGNED_URL_EXPIRY_SECONDS);
    if (data?.signedUrl) {
      signedUrls.set(doc.id, data.signedUrl);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href={`/projects/${id}`}
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to project
      </Link>

      <div className="mt-2 mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-move-navy">
          Client Requirements
        </h1>
        <Link
          href={`/projects/${id}/requirements/summary`}
          className="rounded-xl border border-neutral-border px-4 py-2.5 text-sm font-medium text-move-navy hover:bg-neutral-bg"
        >
          Requirements Summary
        </Link>
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-move-navy">
          RFI Template
        </h2>
        <p className="mt-1 text-sm text-neutral-muted">Template coming soon</p>
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold text-move-navy">
          Upload Document
        </h2>
        <UploadForm projectId={id} />
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
                        <div className="flex items-center gap-4">
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
                          {isOwner && (
                            <DeleteDocumentButton
                              projectId={id}
                              documentId={doc.id}
                              fileName={doc.file_name}
                            />
                          )}
                        </div>
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
