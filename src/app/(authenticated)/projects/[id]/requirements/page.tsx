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
        className="text-sm font-medium text-route-indigo hover:underline"
      >
        ← Back to project
      </Link>

      <h1 className="mt-2 mb-6 font-display text-2xl font-semibold text-ink-navy">
        Client Requirements
      </h1>

      <div className="mb-6 rounded-2xl border border-fog bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-ink-navy">
          RFI Template
        </h2>
        <p className="mt-1 text-sm text-slate">Template coming soon</p>
      </div>

      <div className="mb-6 rounded-2xl border border-fog bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-display text-lg font-semibold text-ink-navy">
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
              className="rounded-2xl border border-fog bg-white p-6 shadow-sm"
            >
              <h2 className="mb-4 font-display text-lg font-semibold text-ink-navy">
                {group.title}
              </h2>

              {docs.length === 0 ? (
                <p className="text-sm text-slate">
                  No documents uploaded yet
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {docs.map((doc) => {
                    const signedUrl = signedUrls.get(doc.id);
                    return (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between border-b border-fog pb-3 last:border-b-0 last:pb-0"
                      >
                        <div>
                          <p className="text-sm text-ink-navy">
                            {doc.file_name}
                          </p>
                          <p className="text-xs text-slate">
                            {new Date(doc.uploaded_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          {signedUrl ? (
                            <a
                              href={signedUrl}
                              className="text-sm font-medium text-route-indigo hover:underline"
                            >
                              Download
                            </a>
                          ) : (
                            <span className="text-sm text-slate">
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
