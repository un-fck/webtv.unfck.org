import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AnimatedCornerLogo } from "@/components/animated-corner-logo";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TimezoneProvider } from "@/lib/hooks/use-timezone";

// Privacy-first analytics (Umami). Only loaded when the env var is set, so
// dev and contributor builds run script-free. No cookies, no consent banner
// needed; aggregates pageviews + referrers + countries at the Umami backend.
const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const UMAMI_SRC =
  process.env.NEXT_PUBLIC_UMAMI_SRC || "https://cloud.umami.is/script.js";

// https://fonts.google.com/specimen/Roboto
// 100 (Thin), 300 (Light), 400 (Regular), 500 (Medium), 700 (Bold), 800 (ExtraBold), 900 (Black)
const roboto = Roboto({
  weight: ["100", "300", "400", "500", "700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "UN Transcripts",
  description: "Browse UN Web TV videos with transcripts of all speeches",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${roboto.variable} antialiased`}>
      <body>
        <TimezoneProvider>
          <TooltipProvider delayDuration={200}>
            {children}
            <AnimatedCornerLogo />
          </TooltipProvider>
        </TimezoneProvider>
        {UMAMI_WEBSITE_ID && (
          <Script
            src={UMAMI_SRC}
            data-website-id={UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
