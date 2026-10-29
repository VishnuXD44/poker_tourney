import Link from "next/link";

export const metadata = { title: "not found" };

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="label">404</p>
      <h1 className="text-xl font-bold">this table doesn&apos;t exist</h1>
      <Link href="/" className="text-xs text-muted hover:text-ink underline underline-offset-4">
        ← back to the dashboard
      </Link>
    </main>
  );
}
