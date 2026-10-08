import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces/soft.css";
import "@fontsource-variable/fraunces/soft-italic.css";
import "@fontsource-variable/outfit";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Between", template: "%s · Between" },
  description: "A little space for the two of you.",
  applicationName: "Between",
  icons: { icon: "/icon.svg" },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Between", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#efe6dc" },
    { media: "(prefers-color-scheme: dark)", color: "#120f0d" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
