import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UPCOMING_STEPS = [
  { title: "Client Requirements", href: "requirements" },
  { title: "3PL List", href: null },
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
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink-navy">
          {project.client_name} — {project.project_name}
        </h1>
        <span className="inline-block rounded-full bg-mist px-2.5 py-1 text-xs font-medium text-slate">
          {project.status}
        </span>
      </div>
      <p className="mb-8 text-xs text-slate">
        Created {new Date(project.date_created).toLocaleDateString()}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {UPCOMING_STEPS.map((step) =>
          step.href ? (
            <Link
              key={step.title}
              href={`/projects/${id}/${step.href}`}
              className="rounded-2xl border border-fog bg-white p-6 shadow-sm hover:bg-mist"
            >
              <h2 className="font-display text-lg font-semibold text-ink-navy">
                {step.title}
              </h2>
            </Link>
          ) : (
            <div
              key={step.title}
              className="rounded-2xl border border-fog bg-white p-6 shadow-sm"
            >
              <h2 className="font-display text-lg font-semibold text-ink-navy">
                {step.title}
              </h2>
              <p className="mt-1 text-sm text-slate">Coming soon</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
