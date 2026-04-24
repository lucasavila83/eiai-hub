import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Lesco-Hub",
  description: "Plataforma de gestão integrada",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
        {/*
          Dedicated root for React portals (toasts, modals, the daily
          agenda). Pointing createPortal at this stable div — instead of
          directly at document.body — isolates React's reconciliation
          from anything else that might mutate the body (browser
          extensions, translation tools, analytics scripts). Without it
          we hit "Cannot read properties of null (reading 'removeChild')"
          during commit, which aborts the render mid-click and looks like
          the click-swallowing / "need to click twice" bug.
        */}
        <div id="portal-root" />
      </body>
    </html>
  );
}
