import './globals.css';

export const metadata = {
  title: 'Pump Pal Login',
  description: 'Sign in with your phone number or Google account.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
