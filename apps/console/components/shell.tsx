"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { SyntheticBadge } from "@nextmove/tokens";
import { CommandMenu } from "@/components/command-menu";
import { Button } from "@/components/ui/button";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ROLES = ["TFS Advisor", "Dealer Staff", "Portfolio Manager", "Admin"] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [role, setRole] = useState<(typeof ROLES)[number]>(ROLES[0]);
  const [dark, setDark] = useState(true);
  const groups = [...new Set(NAV.map((p) => p.group))];

  function toggleTheme() {
    document.documentElement.classList.toggle("dark", !dark);
    setDark(!dark);
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-sidebar text-sidebar-foreground">
        <div className="px-4 py-4 text-sm font-semibold">
          <span className="text-primary">Toyota</span> NextMove
        </div>
        <nav aria-label="Console" className="space-y-4 px-2 pb-4">
          {groups.map((g) => (
            <div key={g}>
              <div className="px-2 pb-1 text-xs uppercase tracking-wide text-muted-foreground">{g}</div>
              {NAV.filter((p) => p.group === g).map((p) => {
                const href = `/${p.slug}`;
                const active = path === href || (!!p.slug && path.startsWith(`${href}/`));
                return (
                  <Link
                    key={p.slug}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring",
                      active && "bg-sidebar-accent font-medium text-sidebar-primary",
                    )}
                  >
                    {p.title}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div role="note" className="bg-primary px-6 py-1 text-center text-xs font-medium text-primary-foreground">
          Synthetic data only. Demo customers, no real people or accounts.
        </div>
        <header className="flex items-center justify-end gap-3 border-b px-6 py-3">
          <div className="mr-auto"><CommandMenu /></div>
          <SyntheticBadge />
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="rounded-md border bg-background px-2 py-1"
            >
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>
            {dark ? <Sun /> : <Moon />}
          </Button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
