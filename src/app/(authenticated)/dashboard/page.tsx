import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, client_name, project_name, status, date_created")
    .order("date_created", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink-navy">
          Projects
        </h1>
        <Link
          href="/dashboard/new"
          className="rounded-xl bg-route-indigo px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-route-indigo-hover"
        >
          New Project
        </Link>
      </div>

      {error && (
        <p className="text-sm text-danger-rose">
          Could not load projects: {error.message}
        </p>
      )}

      {!error && (!projects || projects.length === 0) && (
        <div className="rounded-2xl border border-fog bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-slate">
            No projects yet. Create your first one to get started.
          </p>
        </div>
      )}

      {!error && projects && projects.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-fog bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-fog">
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate">
                  Client
                </th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate">
                  Project
                </th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate">
                  Status
                </th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className="border-b border-fog last:border-b-0 hover:bg-mist"
                >
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block px-4 py-2 text-ink-navy"
                    >
                      {project.client_name}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block px-4 py-2 text-ink-navy"
                    >
                      {project.project_name}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block px-4 py-2"
                    >
                      <span className="inline-block rounded-full bg-mist px-2.5 py-1 text-xs font-medium text-slate">
                        {project.status}
                      </span>
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block px-4 py-2 text-slate"
                    >
                      {new Date(project.date_created).toLocaleDateString()}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
