import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Space_Grotesk } from "next/font/google";
import { brand } from "@/lib/brand";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(brand.productionUrl),
  title: {
    default: brand.title,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  openGraph: {
    title: brand.title,
    description: brand.description,
    siteName: brand.name,
    url: brand.productionUrl,
    type: "website",
  },
  icons: {
    // app/favicon.ico + app/icon.svg + app/apple-icon.png are served via
    // Next.js file conventions; the 192/512 tiles are explicit web app icons.
    icon: [
      { url: brand.assets.icon192, sizes: "192x192", type: "image/png" },
      { url: brand.assets.icon512, sizes: "512x512", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
