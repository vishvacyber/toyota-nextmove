"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; text: string; error?: boolean };
const Ctx = createContext<(text: string, error?: boolean) => void>(() => {});
let seq = 0;

/** Action feedback: `const toast = useToast(); toast("Approved")` or `toast(err.message, true)`. */
export const useToast = () => useContext(Ctx);

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const close = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((text: string, error?: boolean) => {
    const id = ++seq;
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => close(id), error ? 8000 : 4000);
  }, [close]);

  return (
    <Ctx.Provider value={toast}>
      {children}
      <ol aria-live="polite" aria-label="Notifications" className="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <li key={t.id} role={t.error ? "alert" : "status"}
            className={cn("flex items-start gap-2 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg", t.error && "border-destructive/50")}>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", t.error ? "bg-destructive" : "bg-green-500")} aria-hidden />
            <span className="flex-1">{t.text}</span>
            <button type="button" onClick={() => close(t.id)} aria-label="Dismiss notification" className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" /></button>
          </li>
        ))}
      </ol>
    </Ctx.Provider>
  );
}
