const express = require('express');

const { getHealthStatus } = require('./health.controller');

const healthRouter = express.Router();

/**
 * Hàm đăng ký route health.
 * Mục đích: cung cấp endpoint kiểm tra nhanh trạng thái hệ thống.
 */
healthRouter.get('/', getHealthStatus);

module.exports = healthRouter;

