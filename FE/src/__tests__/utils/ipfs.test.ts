import { describe, expect, it } from 'vitest';
import { buildIpfsGatewayUrl, isValidIpfsCid, splitIpfsCidList } from '@/app/utils/ipfs';

const evidenceCidList = [
  'QmcCSpdK8SjNQoLVpQfKbJvBQtr85bgiJsnaQWG3JPNyYw',
  'QmNSR4NNNGUCNxFFXCbuX55u7hYUgXnhjc73VgfLBy61S7',
  'QmPET8izsfcDKPcWeFqcjMXGPFk5fCx4AUhvYifJmJdJVs'
];

describe('IPFS CID helpers', () => {
  it('tách chuỗi nhiều CID Pinata và giữ từng CID hợp lệ độc lập', () => {
    const serializedCidList = ` ${evidenceCidList[0]},${evidenceCidList[1]}\n${evidenceCidList[2]} `;

    expect(splitIpfsCidList(serializedCidList)).toEqual(evidenceCidList);
    expect(evidenceCidList.every(isValidIpfsCid)).toBe(true);
    expect(isValidIpfsCid(serializedCidList)).toBe(false);
  });

  it('dựng gateway URL từ từng CID sau khi đã tách', () => {
    expect(buildIpfsGatewayUrl(evidenceCidList[0])).toBe(
      `https://gateway.pinata.cloud/ipfs/${evidenceCidList[0]}`
    );
  });
});
