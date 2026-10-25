import type { Metadata, Viewport } from "next";
import { MockProvider } from "@nextmove/contracts/mocks/provider";
import { I18nProvider } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = { title: "Toyota NextMove", description: "Your smartest next move (synthetic data)" };
export const viewport: Viewport = { themeColor: "#eb0a1e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <MockProvider>
          <I18nProvider>{children}</I18nProvider>
        </MockProvider>
      </body>
    </html>
  );
}
