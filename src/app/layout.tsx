import type { Metadata } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-socialoreo-display",
});

const ui = Manrope({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-socialoreo-ui",
});

export const metadata: Metadata = {
  title: "SocialOreo — Clearer plans for your next short video",
  description:
    "Turn public short-form video signals into evidence-backed recommendations, hooks, scripts, CTAs, and captions you can post.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={`${display.variable} ${ui.variable}`} lang="en">
      <body>{children}</body>
    </html>
  );
}
