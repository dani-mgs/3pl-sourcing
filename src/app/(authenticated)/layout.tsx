import { logout } from "@/app/logout/actions";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="bg-move-navy">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-8">
          <span className="font-display text-lg font-semibold text-white">
            3PL Sourcing
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-xl border border-white px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10"
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
