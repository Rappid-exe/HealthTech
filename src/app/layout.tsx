import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * Three faces, three jobs.
 *
 * Newsreader carries headlines. A serif gives the product the authority of a
 * clinical reference rather than a dashboard — and Newsreader specifically,
 * because the obvious display serifs (Playfair, Fraunces) have become the
 * recognisable house style of generated design.
 *
 * IBM Plex Sans runs the interface. It was drawn for technical documentation,
 * holds up at small sizes, and is nobody's framework default.
 *
 * IBM Plex Mono sets genotype notation and the ASCII backdrop. `CYP2C19 *2/*2`
 * is data, and it should look like data. Its 0.6em advance also matches the
 * cell metrics the helix geometry is built on.
 */
const display = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Beacon · Pharmacogenomic safety check",
  description:
    "Checks your prescriptions against your genome using published CPIC prescribing guidelines.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
