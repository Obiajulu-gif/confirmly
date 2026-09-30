import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const alongSansHeading = localFont({
  src: [
    {
      path: "../font/along_sans/AlongSanss2-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../font/along_sans/AlongSanss2-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../font/along_sans/AlongSanss2-SemiBold.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../font/along_sans/AlongSanss2-Bold.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../font/along_sans/AlongSanss2-ExtraBold.otf",
      weight: "800",
      style: "normal",
    },
    {
      path: "../font/along_sans/AlongSanss2-Black.otf",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-along-sans",
  display: "swap",
});

const confirmlyBody = localFont({
  src: [
    {
      path: "../fonts/Confirmly-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/Confirmly-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-confirmly",
  display: "swap",
});

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
  alternates: {
    canonical: siteUrl,
  },
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
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.png", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/confirmly-mark.png",
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
    <html
      lang="en-NG"
      className={`${alongSansHeading.variable} ${confirmlyBody.variable}`}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen antialiased font-sans bg-[#fcfcfc] text-[#16232e]"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}


