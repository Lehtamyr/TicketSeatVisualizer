import type { Metadata } from 'next';
import React from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ticketing Seat Visualizer',
  description: 'Dynamic venue seat selection and administration system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-primary text-primary min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
