import { describe, expect, it } from 'vitest';
import { parseAllowedCorsOrigins } from '../../config/cors';

describe('CORS configuration', () => {
  it('ưu tiên danh sách origin chuẩn và parse được nhiều origin', () => {
    expect(parseAllowedCorsOrigins('http://localhost:3000, https://tuthienminhbach.online', 'https://legacy.example'))
      .toEqual(['http://localhost:3000', 'https://tuthienminhbach.online']);
  });

  it('hỗ trợ tên biến origin cũ để không làm hỏng production hiện tại', () => {
    expect(parseAllowedCorsOrigins(undefined, 'https://tuthienminhbach.online'))
      .toEqual(['https://tuthienminhbach.online']);
  });
});
