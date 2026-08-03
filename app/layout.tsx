import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://www.confirmliy.com";
const siteTitle = "Confirmly — Turn WhatsApp orders into verified payments";
const siteDescription =
  "Confirmly converts WhatsApp conversations into structured, payment-ready orders, verifies payment through Monnify, and sends a trusted digital receipt.";
const googleSiteVerification =
  process.env.GOOGLE_SITE_VERIFICATION?.trim() || undefined;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Confirmly",
  title: {
    default: siteTitle,
    template: "%s · Confirmly",
  },
  description: siteDescription,
  keywords: [
    "WhatsApp order management",
    "WhatsApp payments",
    "verified payments Nigeria",
    "Monnify payment verification",
    "digital receipts",
    "merchant order automation",
    "Confirmly",
  ],
  authors: [{ name: "Confirmly" }],
  creator: "Confirmly",
  publisher: "Confirmly",
  category: "business",
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: siteUrl,
    siteName: "Confirmly",
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: googleSiteVerification
    ? { google: googleSiteVerification }
    : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-NG">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
