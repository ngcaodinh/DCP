require('dotenv').config();

const { createExpressApplication } = require('./app');

const defaultPort = 4000;
const portValue = Number(process.env.PORT) || defaultPort;

const expressApplication = createExpressApplication();

/**
 * Hàm khởi động HTTP server.
 * Mục đích: chạy backend local với cổng cấu hình từ biến môi trường.
 */
function startHttpServer() {
  expressApplication.listen(portValue, () => {
    // Ghi log console tại điểm khởi động để dễ kiểm tra trạng thái local.
    console.log(`DCP Backend is running on port ${portValue}`);
  });
}

startHttpServer();

