import type { Metadata, Viewport } from "next";
import { Syne, Plus_Jakarta_Sans, DM_Mono, Cairo } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["400", "500", "600", "700", "800"],
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  weight: ["300", "400", "500", "600", "700"],
});
const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["300", "400", "500"],
});
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "JOAccess Admin",
  description: "JOAccess Platform Administration Dashboard",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0A0606" },
    { media: "(prefers-color-scheme: light)", color: "#F5F1F1" },
  ],
};

/**
 * Pre-hydration script.
 * ---------------------
 * Runs before React hydrates — reads the persisted theme & language from
 * localStorage and sets the right classes + dir on <html> so the first paint
 * matches what the user last picked. Without this the page flashes dark/LTR
 * for a frame and then snaps to light/RTL.
 */
const preHydrationScript = `(function(){try{
  var t = localStorage.getItem('joa-theme');
  var l = localStorage.getItem('joa-lang');
  var html = document.documentElement;
  if (t === 'light') html.classList.add('light');
  if (l === 'ar') {
    html.classList.add('rtl');
    html.setAttribute('lang','ar');
    html.setAttribute('dir','rtl');
  }
}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preHydrationScript }} />
      </head>
      <body
        className={`${syne.variable} ${jakarta.variable} ${dmMono.variable} ${cairo.variable} font-body antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
