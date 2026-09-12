import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('next/image', () => ({ default: 'img' }));

import IpfsEvidencePreviewCard from '@/app/components/common/IpfsEvidencePreviewCard';

const serializedEvidenceCidList = [
  'QmcCSpdK8SjNQoLVpQfKbJvBQtr85bgiJsnaQWG3JPNyYw',
  'QmNSR4NNNGUCNxFFXCbuX55u7hYUgXnhjc73VgfLBy61S7',
  'QmPET8izsfcDKPcWeFqcjMXGPFk5fCx4AUhvYifJmJdJVs'
].join(',');

describe('IpfsEvidencePreviewCard', () => {
  it('render link riêng cho từng CID khi backend trả về chuỗi nhiều CID', () => {
    render(
      <IpfsEvidencePreviewCard
        cid={serializedEvidenceCidList}
        fileName="Minh chứng giải ngân #23"
        mimeType="application/pdf"
        compact
      />
    );

    const ipfsLinks = screen.getAllByRole('link', { name: 'Mở tài liệu IPFS' });

    expect(ipfsLinks).toHaveLength(3);
    expect(screen.queryByText('CID không hợp lệ')).not.toBeInTheDocument();
    expect(ipfsLinks[0]).toHaveAttribute(
      'href',
      `https://gateway.pinata.cloud/ipfs/QmcCSpdK8SjNQoLVpQfKbJvBQtr85bgiJsnaQWG3JPNyYw`
    );
  });
});
