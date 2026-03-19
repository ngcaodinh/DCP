type LogMetadata = {
  correlationId?: string;
  errorMessage?: string;
  errorStack?: string;
  smartAccountAddress?: string;
};

const logger = {
  /**
   * Hàm ghi log thông tin.
   * Mục đích: phục vụ theo dõi sự kiện thường nhật.
   */
  info(message: string, metadata?: LogMetadata): void {
    if (metadata) {
      console.log(message, metadata);
      return;
    }
    console.log(message);
  },
  /**
   * Hàm ghi log cảnh báo.
   * Mục đích: ghi nhận các tình huống bất thường.
   */
  warn(message: string, metadata?: LogMetadata): void {
    if (metadata) {
      console.warn(message, metadata);
      return;
    }
    console.warn(message);
  },
  /**
   * Hàm ghi log lỗi.
   * Mục đích: lưu thông tin lỗi phục vụ điều tra.
   */
  error(message: string, metadata?: LogMetadata): void {
    if (metadata) {
      console.error(message, metadata);
      return;
    }
    console.error(message);
  }
};

/**
 * Hàm lấy logger dùng chung.
 * Mục đích: cung cấp logger thống nhất toàn ứng dụng.
 */
export function getLogger() {
  return logger;
}

