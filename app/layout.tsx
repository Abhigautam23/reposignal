import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepoSignal — Technical candidate evidence",
  description: "Map public GitHub project evidence to technical job requirements, with verifiable sources and clear limitations.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
