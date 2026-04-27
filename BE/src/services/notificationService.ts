import { NotificationModel, type Notification } from '../models/notificationModel';

export type NotificationListResult = {
  notifications: Notification[];
  unreadCount: number;
};

/** Hàm lấy danh sách thông báo của người dùng. Mục đích: cung cấp dữ liệu thật cho dropdown thông báo. */
export async function getUserNotifications(userId: string): Promise<NotificationListResult> {
  const [notifications, unreadCount] = await Promise.all([
    NotificationModel.find({ userId }).sort({ createdAt: -1 }).limit(20).lean<Notification[]>(),
    NotificationModel.countDocuments({ userId, isRead: false })
  ]);

  return { notifications, unreadCount };
}

/** Hàm đánh dấu tất cả thông báo đã đọc. Mục đích: xóa badge chưa đọc của người dùng hiện tại. */
export async function markAllUserNotificationsAsRead(userId: string): Promise<NotificationListResult> {
  await NotificationModel.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
  return getUserNotifications(userId);
}

