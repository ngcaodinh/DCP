/**
 * Shared donation eligibility rules.
 * Keep the deadline check on the backend so clients cannot bypass it by
 * calling a donation endpoint directly.
 */
export type DonationProjectLike = {
  status: ProjectStatus | 'EXPIRED';
  deadline?: Date | string | null;
};

export type PublicProjectStatus = ProjectStatus | 'EXPIRED';

/** Return true when the configured project deadline has passed. */
export function isProjectDeadlineExpired(
  deadline: DonationProjectLike['deadline'],
  now: Date = new Date()
): boolean {
  if (!deadline) {
    return false;
  }

  const deadlineTimestamp = new Date(deadline).getTime();
  return Number.isFinite(deadlineTimestamp) && deadlineTimestamp < now.getTime();
}

/** Return true only while a project is active and still within its deadline. */
export function isProjectDonationOpen(
  project: DonationProjectLike,
  now: Date = new Date()
): boolean {
  return project.status === 'ACTIVE' && !isProjectDeadlineExpired(project.deadline, now);
}

/** Expose the effective public status without mutating the stored lifecycle status. */
export function resolvePublicProjectStatus(
  project: DonationProjectLike,
  now: Date = new Date()
): PublicProjectStatus {
  if (project.status === 'ACTIVE' && isProjectDeadlineExpired(project.deadline, now)) {
    return 'EXPIRED';
  }

  return project.status;
}
import type { ProjectStatus } from '../models/projectModel';
