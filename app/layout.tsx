import type { Metadata } from "next";
import { AppShell } from "@/app/ui/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rvivme | AI Marketing Intelligence",
  description: "AI-assisted SEO, GEO, competitor intelligence, and content operations in one workspace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
