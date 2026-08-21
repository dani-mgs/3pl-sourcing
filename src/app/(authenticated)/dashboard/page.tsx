import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectStatusBadge } from "../project-status-badge";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, client_name, project_name, status, date_created")
    .order("date_created", { ascending: false });

  const { count: totalCount } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true });

  const { count: activeCount } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("status", "Active");

  return (
    <div className="max-w-5xl px-8 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-move-navy">
          Projects
        </h1>
        <Button
          className="whitespace-nowrap px-5 py-2.5"
          nativeButton={false}
          render={<Link href="/dashboard/new" />}
        >
          New Project
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl text-move-navy">
              {totalCount ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-muted">Total Projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl text-move-navy">
              {activeCount ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-muted">Active Projects</p>
          </CardContent>
        </Card>
      </div>

      {error && (
        <p className="text-sm text-danger">
          Could not load projects: {error.message}
        </p>
      )}

      {!error && (!projects || projects.length === 0) && (
        <div className="rounded-2xl border border-neutral-border bg-white p-6 shadow-sm">
          <p className="py-8 text-center text-sm text-neutral-muted">
            No projects yet. Create your first one to get started.
          </p>
        </div>
      )}

      {!error && projects && projects.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-neutral-border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-border">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Client
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Project
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-muted">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className="border-b border-neutral-border last:border-b-0 hover:bg-neutral-bg"
                >
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block px-4 py-3 text-move-navy"
                    >
                      {project.client_name}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block px-4 py-3 text-move-navy"
                    >
                      {project.project_name}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block px-4 py-3"
                    >
                      <ProjectStatusBadge status={project.status} />
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block px-4 py-3 text-neutral-muted"
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
