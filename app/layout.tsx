import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { AnimatedCornerLogo } from "@/components/AnimatedCornerLogo";
import { TooltipProvider } from "@/components/ui/tooltip";

// https://fonts.google.com/specimen/Roboto
// 100 (Thin), 300 (Light), 400 (Regular), 500 (Medium), 700 (Bold), 800 (ExtraBold), 900 (Black)
const roboto = Roboto({
  weight: ["100", "300", "400", "500", "700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "UN Web TV Transcripts",
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
        <TooltipProvider delayDuration={200}>
          {children}
          <AnimatedCornerLogo />
        </TooltipProvider>
      </body>
    </html>
  );
}
