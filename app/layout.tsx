import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shade — Private Nano-Payment Agent",
  description:
    "An autonomous agent whose funding and spending are unreadable on-chain. Dynamic + Unlink + Circle.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
