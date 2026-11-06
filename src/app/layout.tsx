import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Cloud Exam Pro — AWS SAA-C03',
  description: 'Nền tảng luyện đề AWS Certified Solutions Architect Associate (SAA-C03).',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export const viewport: Viewport = { themeColor: '#f97316', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
