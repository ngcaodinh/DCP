const swaggerJSDoc = require('swagger-jsdoc');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'DCP Backend API',
    version: '1.0.0',
    description: 'API documentation for DCP backend services'
  }
};

const swaggerOptions = {
  definition: swaggerDefinition,
  apis: ['src/modules/**/*.js']
};

/**
 * Hàm tạo swagger specification.
 * Mục đích: chuẩn bị tài liệu API cho môi trường phát triển.
 */
function createSwaggerSpecification() {
  return swaggerJSDoc(swaggerOptions);
}

module.exports = {
  createSwaggerSpecification
};

