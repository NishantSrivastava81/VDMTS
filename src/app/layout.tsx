import type { Metadata, Viewport } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
// Bundled locally so formulas never depend on a third-party CDN request.
import "katex/dist/katex.min.css";
import "./globals.css";

const ui = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const teacher = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-teacher",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Next Thought",
  description: "A JEE Mathematics reasoning tutor that helps you find the next thought.",
  applicationName: "Next Thought",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f9f7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${teacher.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
