"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", key: "1", label: "arena", match: (p) => p === "/" },
  { href: "/builder", key: "2", label: "builder", match: (p) => p.startsWith("/builder") },
  { href: "/table", key: "3", label: "tables", match: (p) => p.startsWith("/table") },
];

/**
 * Site-wide bar, styled like a terminal tab strip: a prompt-style wordmark, numbered tabs
 * with the current one lit, and a way back to bevishnu.com.
 */
export default function NavBar() {
  const path = usePathname() || "/";
  return (
    <nav aria-label="Site" className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-sm">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-50 focus:px-3 focus:py-2 focus:bg-ink focus:text-surface focus:text-xs focus:uppercase focus:tracking-widest focus:rounded"
      >
        Skip to main content
      </a>
      <div className="flex items-stretch h-11 px-4 sm:px-6 lg:px-10 text-xs">
        <Link href="/" className="flex items-center gap-2 pr-3 sm:pr-5 mr-1 sm:mr-2 border-r border-line" aria-label="poker_tourney home">
          <span aria-hidden className="text-muted">~/</span>
          <span className="font-bold tracking-tight text-ink hidden sm:inline">poker_tourney</span>
          <span aria-hidden className="font-bold text-ink sm:hidden">pt</span>
          <span aria-hidden className="nav-cursor" />
        </Link>
        <ul className="flex items-stretch">
          {LINKS.map((link) => {
            const active = link.match(path);
            return (
              <li key={link.href} className="flex">
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center gap-1.5 px-2.5 sm:px-4 uppercase tracking-[0.14em] transition-colors ${
                    active ? "text-ink bg-bg" : "text-muted hover:text-ink"
                  }`}
                >
                  <span aria-hidden className={active ? "text-hi" : "text-edge"}>
                    {active ? "▸" : link.key}
                  </span>
                  {link.label}
                  {active && <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" />}
                </Link>
              </li>
            );
          })}
        </ul>
        <a href="https://bevishnu.com" className="ml-auto flex items-center pl-3 text-muted hover:text-ink whitespace-nowrap">
          <span className="hidden md:inline">bevishnu.com</span>
          <span aria-hidden className="md:ml-1.5">↗</span>
          <span className="sr-only md:hidden">bevishnu.com</span>
        </a>
      </div>
    </nav>
  );
}
