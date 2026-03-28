import crypto from 'crypto';

type CreatePaymentLinkInput = {
  orderCode: string;
  amountVnd: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
};

type CreatePaymentLinkResult = {
  paymentUrl: string;
  orderCode: string;
};

/**
 * Hàm đọc checksum key chính của PayOS từ biến môi trường.
 * Mục đích: dùng cho bước ký request tạo payment link.
 */
function getPayosChecksumKey(): string {
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY || process.env.PAYOS_CLIENT_SECRET || process.env.PAYOS_WEBHOOK_SECRET;
  if (!checksumKey) {
    throw new Error('Thiếu cấu hình PayOS checksum key. Kiểm tra PAYOS_CHECKSUM_KEY (hoặc PAYOS_CLIENT_SECRET).');
  }

  return checksumKey;
}

/**
 * Hàm lấy danh sách checksum key hợp lệ để verify webhook.
 * Mục đích: tương thích cấu hình thực tế khi môi trường dùng PAYOS_WEBHOOK_SECRET riêng.
 */
function getPayosChecksumKeysForWebhookVerify(): string[] {
  const checksumKeys = [
    process.env.PAYOS_WEBHOOK_SECRET,
    process.env.PAYOS_CHECKSUM_KEY,
    process.env.PAYOS_CLIENT_SECRET
  ]
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0);

  const uniqueChecksumKeys = Array.from(new Set(checksumKeys));
  if (uniqueChecksumKeys.length === 0) {
    throw new Error('Thiếu cấu hình checksum key cho verify webhook PayOS.');
  }

  return uniqueChecksumKeys;
}

/**
 * Hàm ký payload tạo payment link theo chuẩn PayOS.
 * Mục đích: tạo chữ ký signature để PayOS xác thực request hợp lệ.
 */
function signPayosCreatePaymentPayload(payload: {
  amount: number;
  cancelUrl: string;
  description: string;
  orderCode: number;
  returnUrl: string;
}): string {
  const checksumKey = getPayosChecksumKey();

  // Ghi chú logic phức tạp: Chuỗi ký cần sort key theo alphabet để khớp thuật toán PayOS.
  const signText = Object.entries(payload)
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');

  return crypto.createHmac('sha256', checksumKey).update(signText).digest('hex');
}

/**
 * Hàm tạo link thanh toán từ PayOS.
 * Mục đích: khởi tạo giao dịch VNĐ để người dùng thanh toán trên cổng PayOS.
 */
export async function createPayosPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult> {
  const clientId = process.env.PAYOS_CLIENT_ID;
  const apiKey = process.env.PAYOS_API_KEY;

  if (!clientId || !apiKey) {
    throw new Error('Thiếu cấu hình PayOS. Kiểm tra PAYOS_CLIENT_ID và PAYOS_API_KEY.');
  }

  const signaturePayload = {
    amount: input.amountVnd,
    cancelUrl: input.cancelUrl,
    description: input.description,
    orderCode: Number(input.orderCode),
    returnUrl: input.returnUrl
  };

  const paymentRequestPayload = {
    ...signaturePayload,
    signature: signPayosCreatePaymentPayload(signaturePayload),
    items: [
      {
        name: 'Nap tien Charity Token',
        quantity: 1,
        price: input.amountVnd
      }
    ]
  };

  const response = await fetch('https://api-merchant.payos.vn/v2/payment-requests', {
    method: 'POST',
    headers: {
      'x-client-id': clientId,
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(paymentRequestPayload)
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`PayOS tạo payment link thất bại: ${response.status} ${responseText}`);
  }

  const responsePayload = (await response.json()) as {
    code?: string;
    desc?: string;
    data?: {
      checkoutUrl?: string;
      paymentLinkId?: string;
      orderCode?: string | number;
    };
  };

  const paymentUrl = responsePayload.data?.checkoutUrl || responsePayload.data?.paymentLinkId;
  const orderCodeFromResponse = responsePayload.data?.orderCode;

  // Ghi chú logic phức tạp: PayOS có thể trả orderCode dạng number hoặc string tùy môi trường.
  // Vì vậy cần chuẩn hóa về string nhưng vẫn chấp nhận thiếu orderCode để fallback về orderCode đã gửi đi.
  const normalizedOrderCode =
    orderCodeFromResponse !== undefined && orderCodeFromResponse !== null
      ? String(orderCodeFromResponse)
      : String(input.orderCode);

  if (!paymentUrl) {
    throw new Error(`PayOS trả dữ liệu payment link không hợp lệ. Payload: ${JSON.stringify(responsePayload)}`);
  }

  return {
    paymentUrl,
    orderCode: normalizedOrderCode
  };
}

/**
 * Hàm chuẩn hóa value về chuỗi ký checksum ổn định.
 * Mục đích: xử lý đúng object/array lồng nhau khi webhook có cấu trúc data phức tạp.
 */
function toStableChecksumValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Hàm tạo các biến thể chuỗi ký để verify webhook.
 * Mục đích: tương thích khác biệt giữa tài liệu và payload thực tế từ PayOS.
 */
function buildWebhookSignTextCandidates(data: Record<string, unknown>): string[] {
  const sortedEntries = Object.entries(data)
    .filter(([key, value]) => key !== 'signature' && key !== 'checksum' && value !== undefined)
    .sort(([firstKey], [secondKey]) => {
      if (firstKey < secondKey) {
        return -1;
      }
      if (firstKey > secondKey) {
        return 1;
      }
      return 0;
    });

  const buildSignText = (options: {
    removeNullValue: boolean;
    removeEmptyStringValue: boolean;
    nullValueAsEmptyString: boolean;
  }): string => {
    return sortedEntries
      .filter(([, value]) => {
        if (options.removeNullValue && value === null) {
          return false;
        }
        if (options.removeEmptyStringValue && value === '') {
          return false;
        }
        return true;
      })
      .map(([key, value]) => {
        if (value === null && options.nullValueAsEmptyString) {
          return `${key}=`;
        }
        return `${key}=${toStableChecksumValue(value)}`;
      })
      .join('&');
  };

  return Array.from(new Set([
    buildSignText({ removeNullValue: false, removeEmptyStringValue: false, nullValueAsEmptyString: false }),
    buildSignText({ removeNullValue: true, removeEmptyStringValue: false, nullValueAsEmptyString: false }),
    buildSignText({ removeNullValue: false, removeEmptyStringValue: false, nullValueAsEmptyString: true }),
    buildSignText({ removeNullValue: true, removeEmptyStringValue: true, nullValueAsEmptyString: false })
  ]));
}

/**
 * Hàm xác thực checksum webhook từ PayOS.
 * Mục đích: chống giả mạo webhook và tương thích nhiều biến thể payload callback thực tế.
 */
export function verifyPayosWebhookChecksum(data: Record<string, unknown>, checksum: string): boolean {
  const normalizedChecksum = checksum.trim().toLowerCase();
  const checksumKeys = getPayosChecksumKeysForWebhookVerify();
  const signTextCandidates = buildWebhookSignTextCandidates(data);

  for (const checksumKey of checksumKeys) {
    for (const signTextCandidate of signTextCandidates) {
      const expectedChecksum = crypto.createHmac('sha256', checksumKey).update(signTextCandidate).digest('hex');
      if (expectedChecksum === normalizedChecksum) {
        return true;
      }
    }
  }

  return false;
}

