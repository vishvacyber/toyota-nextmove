import type { Metadata } from "next";
import { MockProvider } from "@nextmove/contracts/mocks/provider";
import { Shell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = { title: "NextMove Console", description: "Toyota NextMove employee console (synthetic data)" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <MockProvider>
          <Shell>{children}</Shell>
        </MockProvider>
      </body>
    </html>
  );
}
