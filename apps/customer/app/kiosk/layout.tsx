import { KioskShell } from "@/components/kiosk-shell";

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <KioskShell>{children}</KioskShell>;
}
