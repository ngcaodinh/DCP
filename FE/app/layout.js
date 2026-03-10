import './globals.css';

export const metadata = {
  title: 'DCP Frontend',
  description: 'Decentralized Charity Platform Frontend'
};

/**
 * Hàm layout gốc của ứng dụng FE.
 * Mục đích: bọc toàn bộ page bằng cấu trúc HTML chuẩn.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

