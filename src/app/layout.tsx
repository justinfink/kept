import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kept - Behavioral Health Referral Closure",
  description: "Close the gap between referral and first appointment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
