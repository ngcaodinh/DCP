const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');

const { createSwaggerSpecification } = require('./config/swagger');
const healthRouter = require('./modules/health/health.routes');

/**
 * Hàm tạo ứng dụng Express.
 * Mục đích: gom middleware và đăng ký route nền tảng cho backend.
 */
function createExpressApplication() {
  const expressApplication = express();

  expressApplication.use(helmet());
  expressApplication.use(cors());
  expressApplication.use(express.json());

  expressApplication.use('/health', healthRouter);

  const swaggerSpecification = createSwaggerSpecification();
  expressApplication.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecification));

  return expressApplication;
}

module.exports = {
  createExpressApplication
};

