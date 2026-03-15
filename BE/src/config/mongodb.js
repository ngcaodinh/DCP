const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017';
const DEFAULT_DATABASE_NAME = 'dcp';

/**
 * Hàm tạo cấu hình MongoDB dùng chung cho toàn hệ thống.
 * Mục đích: chuẩn hóa thông tin kết nối, tùy chọn và tên cơ sở dữ liệu.
 */
function createMongoDbConfig() {
  return {
    uri: process.env.MONGODB_URI || DEFAULT_MONGODB_URI,
    databaseName: process.env.MONGODB_DATABASE_NAME || DEFAULT_DATABASE_NAME,
    options: {
      maxPoolSize: 20,
      minPoolSize: 5,
      retryWrites: true,
      w: 'majority'
    }
  };
}

module.exports = {
  createMongoDbConfig
};

