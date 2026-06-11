import type { Metadata } from "next";
import { Playfair_Display, Jost } from "next/font/google";
import { LanguageProvider } from "@/context/LanguageContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Taru Villas — Luxury Private Villas in Ubud, Bali",
  description:
    "A sanctuary of stillness above the Ayung river valley. Twelve private pool villas in the heart of Ubud, Bali. Opening December 2026.",
  keywords: [
    "Bali villas",
    "Ubud luxury villa",
    "private pool villa Bali",
    "The Taru Villas",
  ],
  openGraph: {
    title: "The Taru Villas — Ubud, Bali",
    description:
      "Private luxury villas above the Ayung river valley, Ubud, Bali.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${playfair.variable} ${jost.variable} antialiased`}>
        <LanguageProvider>
          <Navbar />
          <main>{children}</main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
