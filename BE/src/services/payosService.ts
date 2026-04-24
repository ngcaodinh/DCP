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

export type CreatePayosTransferInput = {
  requestId: string;
  amountVnd: number;
  bankCode: string;
  bankAccountNumber: string;
  accountHolderName: string;
  description: string;
  idempotencyKey: string;
};

export type CreatePayosTransferResult = {
  transferId: string;
  providerTransactionId: string;
  transferStatus: 'PROCESSING' | 'SUCCESS' | 'FAILED';
  rawPayload: unknown;
};

/**
 * Hàm lấy cặp credential cho API transfer PayOS.
 * Mục đích: ưu tiên cấu hình riêng của FR8 và fallback về credential chung khi cần tương thích ngược.
 */
function getPayosTransferApiCredentials(): { clientId: string; apiKey: string } {
  const clientId = String(
    process.env.PAYOS_TRANSFER_CLIENT_ID
    || process.env.PAYOS_PAYOUT_CLIENT_ID
    || process.env.PAYOS_CLIENT_ID
    || ''
  ).trim();
  const apiKey = String(
    process.env.PAYOS_TRANSFER_API_KEY
    || process.env.PAYOS_TRANSFER_PAYOUT_API_KEY
    || process.env.PAYOS_PAYOUT_API_KEY
    || process.env.PAYOS_API_KEY
    || ''
  ).trim();

  if (!clientId || !apiKey) {
    throw new Error(
      'Thiếu cấu hình PayOS transfer. Kiểm tra PAYOS_TRANSFER_CLIENT_ID, PAYOS_TRANSFER_API_KEY (hoặc PAYOS_PAYOUT_CLIENT_ID, PAYOS_PAYOUT_API_KEY, PAYOS_CLIENT_ID, PAYOS_API_KEY).'
    );
  }

  return { clientId, apiKey };
}

/**
 * Hàm đọc checksum key cho API transfer PayOS.
 * Mục đích: dùng để ký header x-signature khi tạo payout FR8.
 */
function getPayosTransferChecksumKey(): string {
  const checksumKey = String(
    process.env.PAYOS_TRANSFER_CHECKSUM_KEY
    || process.env.PAYOS_PAYOUT_CHECKSUM_KEY
    || process.env.PAYOS_CHECKSUM_KEY
    || process.env.PAYOS_CLIENT_SECRET
    || process.env.PAYOS_WEBHOOK_SECRET
    || ''
  ).trim();

  if (!checksumKey) {
    throw new Error(
      'Thiếu cấu hình checksum key cho PayOS transfer. Kiểm tra PAYOS_TRANSFER_CHECKSUM_KEY (hoặc PAYOS_PAYOUT_CHECKSUM_KEY, PAYOS_CHECKSUM_KEY, PAYOS_CLIENT_SECRET).'
    );
  }

  return checksumKey;
}

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
 * Hàm lấy danh sách checksum key cho webhook chuyển khoản FR8.
 * Mục đích: xác thực callback transfer bằng key chuyên biệt, đồng thời vẫn fallback key chung để tương thích môi trường cũ.
 */
function getPayosTransferChecksumKeysForWebhookVerify(): string[] {
  const checksumKeys = [
    process.env.PAYOS_TRANSFER_CHECKSUM_KEY,
    process.env.PAYOS_PAYOUT_CHECKSUM_KEY,
    process.env.PAYOS_WEBHOOK_SECRET,
    process.env.PAYOS_CHECKSUM_KEY,
    process.env.PAYOS_CLIENT_SECRET
  ]
    .map((value) => String(value || '').trim())
    .filter((value) => value.length > 0);

  const uniqueChecksumKeys = Array.from(new Set(checksumKeys));
  if (uniqueChecksumKeys.length === 0) {
    throw new Error('Thiếu cấu hình checksum key cho webhook transfer PayOS.');
  }

  return uniqueChecksumKeys;
}

/**
 * Hàm chuẩn hóa value cho chuỗi ký request PayOS.
 * Mục đích: đảm bảo dữ liệu được URL-encode đúng chuẩn trước khi tính HMAC.
 */
function toPayosRequestSignatureValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => encodeURIComponent(String(item))).join(',');
  }

  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    return encodeURIComponent(JSON.stringify(value));
  }

  return encodeURIComponent(String(value));
}

/**
 * Hàm dựng chuỗi dữ liệu để ký request PayOS.
 * Mục đích: gom key-value theo thứ tự alphabet nhằm đồng nhất thuật toán ký.
 */
function buildPayosRequestSignText(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
    .map(([key, value]) => `${encodeURIComponent(key)}=${toPayosRequestSignatureValue(value)}`)
    .join('&');
}

/**
 * Hàm ký payload transfer theo chuẩn PayOS.
 * Mục đích: tạo chữ ký HMAC SHA256 cho header x-signature của API payout.
 */
function signPayosTransferPayload(payload: Record<string, unknown>): string {
  const checksumKey = getPayosTransferChecksumKey();
  const signText = buildPayosRequestSignText(payload);
  return crypto.createHmac('sha256', checksumKey).update(signText).digest('hex');
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
 * Hàm chuyển đổi trạng thái transfer thô từ PayOS về trạng thái chuẩn nội bộ.
 * Mục đích: tránh lệ thuộc chặt vào một định dạng status duy nhất từ cổng thanh toán.
 */
function mapPayosTransferStatus(statusValue: string): 'PROCESSING' | 'SUCCESS' | 'FAILED' {
  const normalizedStatusValue = statusValue.trim().toUpperCase();

  if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'PAID', 'DONE'].includes(normalizedStatusValue)) {
    return 'SUCCESS';
  }

  if (['FAILED', 'ERROR', 'CANCELLED', 'CANCELED', 'REJECTED'].includes(normalizedStatusValue)) {
    return 'FAILED';
  }

  return 'PROCESSING';
}

/**
 * Hàm chuẩn hóa danh sách transaction từ response payout PayOS.
 * Mục đích: hỗ trợ cả trường hợp transactions là array hoặc object.
 */
function normalizePayosTransferTransactionList(rawTransactions: unknown): Record<string, unknown>[] {
  if (Array.isArray(rawTransactions)) {
    return rawTransactions
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  }

  if (rawTransactions && typeof rawTransactions === 'object') {
    return Object.values(rawTransactions)
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  }

  return [];
}

/**
 * Hàm lấy transaction chính từ response payout PayOS.
 * Mục đích: trích xuất transaction id và trạng thái chính để đồng bộ về hệ thống nội bộ.
 */
function getPrimaryPayosTransferTransaction(payoutData: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!payoutData) {
    return null;
  }

  const directTransactionList = normalizePayosTransferTransactionList(payoutData.transactions);
  if (directTransactionList.length > 0) {
    return directTransactionList[0];
  }

  const payoutList = Array.isArray(payoutData.payouts) ? payoutData.payouts : [];
  for (const payoutItem of payoutList) {
    if (!payoutItem || typeof payoutItem !== 'object') {
      continue;
    }

    const payoutRecord = payoutItem as Record<string, unknown>;
    const nestedTransactionList = normalizePayosTransferTransactionList(payoutRecord.transactions);
    if (nestedTransactionList.length > 0) {
      return nestedTransactionList[0];
    }
  }

  return null;
}

/**
 * Hàm tạo lệnh chuyển khoản ngân hàng qua PayOS cho luồng FR8.
 * Mục đích: thực thi auto-transfer có idempotency key để chống gửi trùng giao dịch.
 */
export async function createPayosTransfer(input: CreatePayosTransferInput): Promise<CreatePayosTransferResult> {
  const { clientId, apiKey } = getPayosTransferApiCredentials();

  const configuredTransferEndpointUrl = String(
    process.env.PAYOS_TRANSFER_API_URL
    || process.env.PAYOS_PAYOUT_API_URL
    || 'https://api-merchant.payos.vn/v1/payouts'
  ).trim();
  // Ghi chú logic phức tạp: tương thích ngược với cấu hình cũ còn dùng /v1/transfers để tránh 404.
  const transferEndpointUrl = configuredTransferEndpointUrl
    .replace(/\/v1\/transfers\/?$/i, '/v1/payouts');
  const transferTimeoutMilliseconds = Number(process.env.PAYOS_TRANSFER_TIMEOUT_MS || 30000);

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), transferTimeoutMilliseconds);

  try {
    const transferCategoryList = String(process.env.PAYOS_TRANSFER_CATEGORIES || 'transfer')
      .split(',')
      .map((categoryItem) => categoryItem.trim())
      .filter((categoryItem) => categoryItem.length > 0);

    const transferRequestPayload = {
      referenceId: input.requestId,
      amount: input.amountVnd,
      description: input.description,
      toBin: input.bankCode,
      toAccountNumber: input.bankAccountNumber,
      recipientName: input.accountHolderName,
      category: transferCategoryList.length > 0 ? transferCategoryList : ['transfer']
    };
    const transferRequestSignature = signPayosTransferPayload(transferRequestPayload);

    const response = await fetch(transferEndpointUrl, {
      method: 'POST',
      headers: {
        'x-client-id': clientId,
        'x-api-key': apiKey,
        'x-signature': transferRequestSignature,
        'x-idempotency-key': input.idempotencyKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(transferRequestPayload),
      signal: abortController.signal
    });

    const responseText = await response.text();
    let responsePayload: unknown = null;
    try {
      responsePayload = responseText ? JSON.parse(responseText) : null;
    } catch {
      responsePayload = responseText;
    }

    if (!response.ok) {
      throw new Error(`PayOS transfer thất bại: ${response.status} ${responseText}`);
    }

    const normalizedPayload = (responsePayload || {}) as {
      code?: string | number;
      status?: string;
      data?: {
        transferId?: string | number;
        id?: string | number;
        transactionId?: string | number;
        bankReferenceNumber?: string | number;
        referenceNumber?: string | number;
        status?: string;
        state?: string;
        approvalState?: string;
        transactions?: unknown;
        payouts?: unknown;
      };
    };
    const normalizedData = (normalizedPayload.data || {}) as Record<string, unknown>;
    const primaryTransaction = getPrimaryPayosTransferTransaction(normalizedData);

    const transferId = String(
      normalizedData.transferId
      || normalizedData.id
      || normalizedData.transactionId
      || normalizedData.referenceId
      || (primaryTransaction ? primaryTransaction.id : undefined)
      || (primaryTransaction ? primaryTransaction.transactionId : undefined)
      || input.idempotencyKey
    );

    const providerTransactionId = String(
      (primaryTransaction ? primaryTransaction.transactionId : undefined)
      || (primaryTransaction ? primaryTransaction.id : undefined)
      || (primaryTransaction ? primaryTransaction.bankReferenceNumber : undefined)
      || (primaryTransaction ? primaryTransaction.referenceNumber : undefined)
      || normalizedData.transactionId
      || normalizedData.bankReferenceNumber
      || normalizedData.referenceNumber
      || transferId
    );

    const rawTransferStatus = String(
      (primaryTransaction ? primaryTransaction.state : undefined)
      || (primaryTransaction ? primaryTransaction.status : undefined)
      || (primaryTransaction ? primaryTransaction.approvalState : undefined)
      || normalizedData.state
      || normalizedData.status
      || normalizedData.approvalState
      || normalizedPayload.status
      || normalizedPayload.code
      || ''
    );

    return {
      transferId,
      providerTransactionId,
      transferStatus: mapPayosTransferStatus(rawTransferStatus),
      rawPayload: responsePayload
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
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
  return verifyPayosWebhookChecksumByKeys(data, checksum, getPayosChecksumKeysForWebhookVerify());
}

/**
 * Hàm xác thực checksum webhook chuyển khoản FR8.
 * Mục đích: kiểm tra tính toàn vẹn callback transfer bằng checksum key chuyên biệt của kênh chuyển tiền.
 */
export function verifyPayosTransferWebhookChecksum(data: Record<string, unknown>, checksum: string): boolean {
  return verifyPayosWebhookChecksumByKeys(data, checksum, getPayosTransferChecksumKeysForWebhookVerify());
}

/**
 * Hàm xác thực checksum webhook theo danh sách key đầu vào.
 * Mục đích: tái sử dụng chung cho cả webhook deposit và webhook transfer.
 */
function verifyPayosWebhookChecksumByKeys(
  data: Record<string, unknown>,
  checksum: string,
  checksumKeys: string[]
): boolean {
  const normalizedChecksum = checksum.trim().toLowerCase();
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
