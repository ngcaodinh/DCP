import './globals.css';
import { Be_Vietnam_Pro, Lexend } from 'next/font/google';

const beVietnamProFont = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-be-vietnam-pro'
});

const lexendFont = Lexend({
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-lexend'
});

export const metadata = {
  title: 'DCP — Nền tảng Từ thiện Phi tập trung',
  description: 'Decentralized Charity Platform (DCP)'
};

/**
 * Hàm layout gốc của ứng dụng FE.
 * Mục đích: bọc toàn bộ trang bằng cấu trúc HTML và cấu hình font chuẩn Next.js.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${beVietnamProFont.variable} ${lexendFont.variable}`}>{children}</body>
    </html>
  );
}

