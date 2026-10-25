import type { Metadata } from "next";
import { MockProvider } from "@/components/mock-provider";
import { Shell } from "@/components/shell";
import { Toaster } from "@/components/toast";
import "./globals.css";

export const metadata: Metadata = { title: "NXT Console", description: "Toyota Financial Services NXT employee console" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <MockProvider>
          <Toaster><Shell>{children}</Shell></Toaster>
        </MockProvider>
      </body>
    </html>
  );
}
