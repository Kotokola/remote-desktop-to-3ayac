import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEON DESK // Remote Cyber Control",
  description: "Cyberpunk remote desktop control",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
      </head>
      <body className="cyber-grid min-h-screen antialiased">{children}</body>
    </html>
  );
}
