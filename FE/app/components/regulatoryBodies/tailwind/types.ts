export type PageKey = 'dashboard' | 'disbursement' | 'kyc' | 'report' | 'transparency';

export type NavigationItem = {
  key: PageKey;
  label: string;
  badge?: number;
  iconPath: string;
};

export type UrgentRequestItem = {
  id: string;
  projectName: string;
  organizationName: string;
  amountText: string;
  signatureState: string;
  deadlineText: string;
  deadlineLevel: 'urgent' | 'normal' | 'ok';
};

export type AuditLogItem = {
  transactionId: string;
  requestId: string;
  amountText: string;
  statusText: string;
  actorText: string;
  timeText: string;
};

export type TimelineItem = {
  actionText: string;
  detailText: string;
  timeText: string;
  type: 'sign' | 'view' | 'reject' | 'login';
};

export type ToastItem = {
  id: string;
  titleText: string;
  bodyText: string;
  tone: 'success' | 'error' | 'info';
};

export type DrawerTabKey = 'overview' | 'evidence' | 'signature' | 'history';

