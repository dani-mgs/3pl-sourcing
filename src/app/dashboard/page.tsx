import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/logout/actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, client_name, project_name, status, date_created")
    .order("date_created", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Projects</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/new"
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            New Project
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Log Out
            </button>
          </form>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600">
          Could not load projects: {error.message}
        </p>
      )}

      {!error && (!projects || projects.length === 0) && (
        <p className="text-sm text-gray-500">No projects yet.</p>
      )}

      {!error && projects && projects.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className="border-t border-gray-200 hover:bg-gray-50"
                >
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block px-4 py-2 text-gray-900"
                    >
                      {project.client_name}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block px-4 py-2 text-gray-700"
                    >
                      {project.project_name}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block px-4 py-2 text-gray-700"
                    >
                      {project.status}
                    </Link>
                  </td>
                  <td className="px-0 py-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block px-4 py-2 text-gray-700"
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
