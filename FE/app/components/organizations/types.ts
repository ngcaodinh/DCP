export type OrganizationPageKey = 'dashboard' | 'projects' | 'disbursement' | 'transparency' | 'settings';

export type NavigationItem = {
  icon: string;
  label: string;
  page?: OrganizationPageKey;
  badge?: string;
  action?: 'createProject' | 'toggleNotification';
};

export type StatisticItem = {
  color: 'emerald' | 'blue' | 'amber' | 'gold';
  icon: string;
  label: string;
  value: string;
  subtitle: string;
  change: string;
  changeStyle?: 'up' | 'warn';
};

export type ProjectItem = {
  emoji: string;
  thumbStyle: string;
  statusLabel: string;
  statusStyle: string;
  name: string;
  description: string;
  progressLabel: string;
  progressPercent: number;
  raisedAmount: string;
  goalAmount: string;
  footerMeta: string[];
  statusKey: 'active' | 'pending' | 'done';
};

export type TimelineItem = {
  dotStyle: string;
  content: string;
  time: string;
};

export type TransactionRow = {
  time: string;
  type: string;
  amount: string;
  sender: string;
  hash: string;
  status: string;
  typeStyle: string;
  statusStyle: string;
};

export type ProjectSummaryStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'COMPLETED' | 'CLOSED' | 'REJECTED';

export type ProjectSummary = {
  projectId: string;
  organizationId: string;
  name: string;
  description: string;
  goalAmount: number;
  deadline: string;
  status: ProjectSummaryStatus;
  evidenceCids: string[];
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
};
