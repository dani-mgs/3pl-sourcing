import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectStatusBadge } from "../../project-status-badge";

const UPCOMING_STEPS = [
  { title: "Client Requirements", href: "requirements" },
  { title: "3PL List", href: "providers" },
  { title: "Comparison", href: null },
  { title: "Recommendation", href: null },
];

export default async function ProjectDetailsPage({
  params,
}: PageProps<"/projects/[id]">) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, client_name, project_name, status, date_created")
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  return (
    <div className="max-w-5xl px-8 py-10">
      <Link
        href="/dashboard"
        className="text-sm font-medium text-move-green hover:underline"
      >
        ← Back to Dashboard
      </Link>

      <div className="mt-2 mb-2 flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-move-navy">
          {project.client_name} — {project.project_name}
        </h1>
        <ProjectStatusBadge status={project.status} />
      </div>
      <p className="mb-8 text-xs text-neutral-muted">
        Created {new Date(project.date_created).toLocaleDateString()}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {UPCOMING_STEPS.map((step) =>
          step.href ? (
            <Link
              key={step.title}
              href={`/projects/${id}/${step.href}`}
              className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm hover:bg-neutral-bg"
            >
              <h2 className="font-display text-lg font-semibold text-move-navy">
                {step.title}
              </h2>
            </Link>
          ) : (
            <div
              key={step.title}
              className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm"
            >
              <h2 className="font-display text-lg font-semibold text-move-navy">
                {step.title}
              </h2>
              <p className="mt-1 text-sm text-neutral-muted">Coming soon</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
