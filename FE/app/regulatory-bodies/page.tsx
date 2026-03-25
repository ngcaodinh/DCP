import type { Metadata } from 'next';
import RegulatoryBodiesPageClientTailwind from '../components/regulatoryBodies/RegulatoryBodiesPageClientTailwind';

export const metadata: Metadata = {
  title: 'DCP - Cơ quan Giám sát',
  description: 'Trang Cơ quan giám sát (Regulatory Bodies) với dữ liệu giả lập để thao tác UI.'
};

/**
 * Hàm trang Cơ quan giám sát.
 * Mục đích: render giao diện Regulatory Bodies full-screen bằng component cô lập, không ảnh hưởng các trang khác.
 */
export default function RegulatoryBodiesPage() {
  return <RegulatoryBodiesPageClientTailwind />;
}

