import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pump Pal - Login',
  description: 'Secure login using phone number or Google via Firebase.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
