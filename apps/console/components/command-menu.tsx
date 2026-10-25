"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { Customer } from "@nextmove/contracts";
import { api } from "@nextmove/contracts/client";
import { Button } from "@/components/ui/button";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

type Item = { href: string; title: string; hint: string };

/** Cmd/Ctrl+K: jump to any page, or find a customer by id/name via GET /customers?q=. */
export function CommandMenu() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (dialog.current?.open) dialog.current.close(); else dialog.current?.showModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      setSearching(true);
      api<Customer[]>(`/customers?q=${encodeURIComponent(term)}`).then(
        (list) => { if (live) { setCustomers(list.slice(0, 6)); setError(undefined); } },
        (e: Error) => live && setError(e.message),
      ).finally(() => live && setSearching(false));
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const term = q.trim().toLowerCase();
  const items: Item[] = [
    ...NAV.filter((p) => !term || `${p.title} ${p.group}`.toLowerCase().includes(term)).map((p) => ({ href: `/${p.slug}`, title: p.title, hint: p.group })),
    ...(term.length >= 2 ? customers : []).map((c) => ({ href: `/customers/${c.id}`, title: `${c.first_name} ${c.last_name}`, hint: c.id })),
  ];
  const sel = Math.min(active, items.length - 1);

  function go(item?: Item) {
    if (!item) return;
    dialog.current?.close();
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((sel + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((sel - 1 + items.length) % items.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(items[sel]); }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => dialog.current?.showModal()} className="text-muted-foreground">
        <Search /> Search <kbd className="ml-2 rounded border px-1 font-mono text-xs">⌘K</kbd>
      </Button>
      <dialog
        ref={dialog} aria-label="Command menu" onClose={() => { setQ(""); setActive(0); }}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className="m-auto mt-[15vh] w-[32rem] max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-0 text-popover-foreground shadow-2xl backdrop:bg-black/50"
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input
            autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKeyDown}
            placeholder="Jump to a page or find a customer by name or ID…" aria-label="Search pages and customers"
            role="combobox" aria-expanded="true" aria-controls="command-list" aria-activedescendant={items[sel] ? `cmd-${sel}` : undefined}
            className="h-11 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <ul id="command-list" role="listbox" className="max-h-80 overflow-y-auto p-1">
          {items.map((it, i) => (
            <li
              key={it.href} id={`cmd-${i}`} role="option" aria-selected={i === sel}
              onMouseEnter={() => setActive(i)} onClick={() => go(it)}
              className={cn("flex cursor-pointer justify-between gap-2 rounded-md px-3 py-2 text-sm", i === sel && "bg-accent")}
            >
              <span>{it.title}</span><span className="font-mono text-xs text-muted-foreground">{it.hint}</span>
            </li>
          ))}
          {!items.length && !searching && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No pages or customers match.</li>}
        </ul>
        {(searching || error) && (
          <p className={cn("border-t px-3 py-2 text-xs", error ? "text-destructive" : "text-muted-foreground")} role="status">
            {error ? `Customer search failed: ${error}` : "Searching customers…"}
          </p>
        )}
      </dialog>
    </>
  );
}

