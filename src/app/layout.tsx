import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import { normalizeLocale, localeIsRtl } from "@/lib/socialolla/i18n/locales";
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
  title: "SocialOlla — Plan, post and watch your social content",
  description:
    "Plan, post and watch your social content with destination-specific Posts, a seven-day plan and Basic Profile Analysis. Start with a free demo.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get("so_locale")?.value);
  const dir = localeIsRtl(locale) ? "rtl" : "ltr";

  return (
    <html className={`${display.variable} ${ui.variable}`} lang={locale.split("-")[0]} dir={dir}>
      <body>{children}</body>
    </html>
  );
}
