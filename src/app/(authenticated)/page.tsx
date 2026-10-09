import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { APP_NAME, HUB_MODULES } from "@/lib/modules";
import { getUserRole, NO_ROLE_MESSAGE } from "@/lib/auth/get-user-role";

const cardBase = "flex h-full flex-col gap-2 rounded-2xl border p-6 shadow-sm";

export default async function HubHomePage() {
  const role = await getUserRole();
  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="font-display text-2xl font-semibold text-move-navy">
        {APP_NAME}
      </h1>
      <p className="mt-1 mb-8 text-sm text-neutral-muted">
        Choose a module to get started.
      </p>
      {role === null && (
        <p
          role="status"
          className="mb-8 rounded-xl border border-neutral-border bg-white p-4 text-sm text-move-navy"
        >
          {NO_ROLE_MESSAGE}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {HUB_MODULES.map((module) => (
          <li key={module.name}>
            {module.href ? (
              <Link
                href={module.href}
                className={`${cardBase} group border-neutral-border bg-white transition-colors hover:border-move-green focus-visible:ring-2 focus-visible:ring-move-green focus-visible:outline-none`}
              >
                <h2 className="flex items-center justify-between font-display text-lg font-semibold text-move-navy">
                  {module.name}
                  <ArrowRight className="size-4 text-move-green transition-transform group-hover:translate-x-0.5" />
                </h2>
                <p className="text-sm text-neutral-muted">
                  {module.description}
                </p>
              </Link>
            ) : (
              <div
                aria-disabled="true"
                className={`${cardBase} cursor-not-allowed border-neutral-border bg-neutral-bg`}
              >
                <h2 className="flex items-center justify-between gap-2 font-display text-lg font-semibold text-neutral-muted">
                  {module.name}
                  <Badge
                    variant="outline"
                    className="shrink-0 border-neutral-border bg-white text-neutral-muted"
                  >
                    Coming Soon
                  </Badge>
                </h2>
                <p className="text-sm text-neutral-muted">
                  {module.description}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
