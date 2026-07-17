import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Confirmly — Turn WhatsApp orders into verified payments",
    template: "%s · Confirmly",
  },
  description:
    "Confirmly converts WhatsApp conversations into structured, payment-ready orders, verifies payment through Monnify, and sends a trusted digital receipt.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
