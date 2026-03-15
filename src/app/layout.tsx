import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { themeConfig } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'md-serve',
  description: 'Local markdown file server',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider {...themeConfig}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
