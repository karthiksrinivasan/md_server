import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { themeConfig } from '@/lib/theme';
import { ToastProvider } from '@/components/toast';
import { LayoutProvider } from './layout-context';
import { LayoutClient } from './layout-client';
import './globals.css';

export const metadata: Metadata = {
  title: 'md-serve',
  description: 'Local markdown file viewer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider {...themeConfig}>
          <ToastProvider>
            <LayoutProvider>
              <LayoutClient>{children}</LayoutClient>
            </LayoutProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
