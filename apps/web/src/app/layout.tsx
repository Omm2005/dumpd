import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Public_Sans } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";
import { cn } from "@dumpd/ui/lib/utils";
import { PwaRegister } from "@/components/pwa-register";

const spaceGroteskHeading = Space_Grotesk({subsets:['latin'],variable:'--font-heading'});

const publicSans = Public_Sans({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "dumpd",
  description: "dumpd",
  applicationName: "dumpd",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "dumpd",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffaf5" },
    { media: "(prefers-color-scheme: dark)", color: "#25201b" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", publicSans.variable, spaceGroteskHeading.variable)}>
      <body className={`antialiased`}>
        <Providers>
          <PwaRegister />
          {children}
        </Providers>
      </body>
    </html>
  );
}
