/**
 * Hàm xử lý endpoint health check.
 * Mục đích: trả trạng thái backend để kiểm tra service đang hoạt động.
 */
function getHealthStatus(request, response) {
  return response.status(200).json({
    serviceName: 'dcp-backend',
    status: 'ok',
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  getHealthStatus
};

