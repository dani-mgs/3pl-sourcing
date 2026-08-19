import { logout } from "@/app/logout/actions";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b border-fog bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <span className="font-display text-lg font-semibold text-ink-navy">
            3PL Sourcing
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-xl border border-fog px-4 py-2.5 text-sm font-medium text-ink-navy hover:bg-mist"
            >
              Log Out
            </button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
