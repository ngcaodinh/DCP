import mongoose, { Schema } from 'mongoose';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  walletAddress: string;
  socialProvider: string;
  socialAccountId: string;
  isEmailVerified: boolean;
  accountStatus: 'ACTIVE' | 'INACTIVE_PENDING_KYC';
  organizationName: string | null;
  legalRegistrationNumber: string | null;
  lastLoginAt: Date;
  lastLoginIp: string | null;
  lastLoginUserAgent: string | null;
  correlationId: string;
};

export type RefreshSession = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  csrfToken: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  failedRefreshCount: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AuditLogEntry = {
  id: string;
  userId: string | null;
  email: string | null;
  eventType: string;
  ipAddress: string;
  userAgent: string;
  detail: string;
  createdAt: Date;
};

const authUserSchema = new Schema<AuthUser>({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  role: { type: String, required: true },
  walletAddress: { type: String, required: true },
  socialProvider: { type: String, required: true },
  socialAccountId: { type: String, required: true },
  isEmailVerified: { type: Boolean, required: true },
  accountStatus: { type: String, required: true },
  organizationName: { type: String, default: null },
  legalRegistrationNumber: { type: String, default: null, unique: true, sparse: true },
  lastLoginAt: { type: Date, required: true },
  lastLoginIp: { type: String, default: null },
  lastLoginUserAgent: { type: String, default: null },
  correlationId: { type: String, required: true }
});

const refreshSessionSchema = new Schema<RefreshSession>({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  refreshTokenHash: { type: String, required: true },
  csrfToken: { type: String, required: true },
  ipAddress: { type: String, required: true },
  userAgent: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  failedRefreshCount: { type: Number, required: true },
  lockedUntil: { type: Date, default: null },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true }
});

const auditLogSchema = new Schema<AuditLogEntry>({
  id: { type: String, required: true, unique: true },
  userId: { type: String, default: null },
  email: { type: String, default: null },
  eventType: { type: String, required: true },
  ipAddress: { type: String, required: true },
  userAgent: { type: String, required: true },
  detail: { type: String, required: true },
  createdAt: { type: Date, required: true }
});

const AuthUserModel = mongoose.model<AuthUser>('AuthUser', authUserSchema);
const RefreshSessionModel = mongoose.model<RefreshSession>('RefreshSession', refreshSessionSchema);
const AuditLogModel = mongoose.model<AuditLogEntry>('AuditLog', auditLogSchema);

/**
 * Hàm tìm người dùng theo mã số đăng ký pháp lý.
 * Mục đích: kiểm tra trùng dữ liệu pháp lý của tổ chức.
 */
export async function findUserByLegalRegistrationNumber(legalRegistrationNumber: string): Promise<AuthUser | null> {
  return AuthUserModel.findOne({ legalRegistrationNumber }).lean<AuthUser>().exec();
}

/**
 * Hàm tìm người dùng theo email.
 * Mục đích: lấy dữ liệu người dùng từ MongoDB theo email.
 */
export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  return AuthUserModel.findOne({ email }).lean<AuthUser>().exec();
}

/**
 * Hàm tìm người dùng theo id.
 * Mục đích: lấy dữ liệu người dùng từ MongoDB theo định danh.
 */
export async function findUserById(userId: string): Promise<AuthUser | null> {
  return AuthUserModel.findOne({ id: userId }).lean<AuthUser>().exec();
}

/**
 * Hàm lưu mới người dùng.
 * Mục đích: tạo dữ liệu người dùng trong MongoDB.
 */
export async function createUser(user: AuthUser): Promise<AuthUser> {
  const createdUser = await AuthUserModel.create(user);
  return createdUser.toObject() as AuthUser;
}

/**
 * Hàm cập nhật người dùng.
 * Mục đích: lưu trạng thái đăng nhập mới nhất.
 */
export async function updateUser(user: AuthUser): Promise<AuthUser> {
  const updatedUser = await AuthUserModel.findOneAndUpdate(
    { id: user.id },
    user,
    { returnDocument: 'after' }
  ).exec();
  return (updatedUser?.toObject() as AuthUser) || user;
}

/**
 * Hàm tạo phiên refresh token.
 * Mục đích: lưu hash refresh token và metadata thiết bị.
 */
export async function createRefreshSession(session: RefreshSession): Promise<RefreshSession> {
  const createdSession = await RefreshSessionModel.create(session);
  return createdSession.toObject() as RefreshSession;
}

/**
 * Hàm tìm phiên refresh token theo id.
 * Mục đích: phục vụ xác thực khi làm mới token.
 */
export async function findRefreshSessionById(sessionId: string): Promise<RefreshSession | null> {
  return RefreshSessionModel.findOne({ id: sessionId }).lean<RefreshSession>().exec();
}

/**
 * Hàm cập nhật phiên refresh token.
 * Mục đích: lưu trạng thái lockout hoặc rotate token.
 */
export async function updateRefreshSession(session: RefreshSession): Promise<RefreshSession> {
  const updatedSession = await RefreshSessionModel.findOneAndUpdate(
    { id: session.id },
    session,
    { returnDocument: 'after' }
  ).exec();
  return (updatedSession?.toObject() as RefreshSession) || session;
}

/**
 * Hàm lấy danh sách phiên refresh token còn hiệu lực theo userId.
 * Mục đích: cung cấp dữ liệu phiên đăng nhập thật cho màn hình bảo mật.
 */
export async function getActiveRefreshSessionsByUserId(userId: string): Promise<RefreshSession[]> {
  const currentTime = new Date();
  return RefreshSessionModel.find({ userId, expiresAt: { $gt: currentTime } })
    .sort({ updatedAt: -1 })
    .lean<RefreshSession[]>()
    .exec();
}

/**
 * Hàm thu hồi toàn bộ phiên refresh token theo userId.
 * Mục đích: đăng xuất toàn bộ thiết bị của người dùng.
 */
export async function revokeRefreshSessionsByUserId(userId: string): Promise<void> {
  await RefreshSessionModel.deleteMany({ userId }).exec();
}

/**
 * Hàm thu hồi phiên refresh token.
 * Mục đích: xoá phiên khi hết hạn hoặc sai bảo mật.
 */
export async function revokeRefreshSession(sessionId: string): Promise<void> {
  await RefreshSessionModel.deleteOne({ id: sessionId }).exec();
}

/**
 * Hàm ghi audit log.
 * Mục đích: lưu sự kiện đăng nhập thất bại hoặc thiết bị mới.
 */
export async function addAuditLog(entry: AuditLogEntry): Promise<void> {
  await AuditLogModel.create(entry);
}

