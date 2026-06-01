/**
 * Hook quản lý TanStack Query polling cho session status.
 * Mục đích: tách polling logic ra khỏi Provider để dễ test và maintain.
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGuestSessionStatus } from '../utils/guestApiClient';
import { loadGuestSessionToken } from '../utils/guestWalletStorage';
import { SESSION_POLL_INTERVAL_MS } from '../constants/guestDonationLimits';

interface UseGuestSessionPollingOptions {
  sessionId: string | null;
  isReady: boolean;
  onPollData: (data: {
    donationCount: number;
    remainingDonations: number;
    donationQuota: number;
  }) => void;
}

interface UseGuestSessionPollingReturn {
  isPolling: boolean;
  refreshNow: () => void;
}

/**
 * Hook quản lý TanStack Query polling cho guest session status.
 * Poll server mỗi SESSION_POLL_INTERVAL_MS để sync donationCount real-time.
 */
export function useGuestSessionPolling({
  sessionId,
  isReady,
  onPollData,
}: UseGuestSessionPollingOptions): UseGuestSessionPollingReturn {
  const onPollDataRef = useRef(onPollData);

  // Cập nhật ref trong effect để tránh side-effect trong render phase (Concurrent Mode safe)
  useEffect(() => {
    onPollDataRef.current = onPollData;
  }, [onPollData]);

  // Lấy token từ sessionStorage — cần thiết cho API call
  const getToken = useCallback((): string | null => {
    const tokenData = loadGuestSessionToken();
    return tokenData?.token ?? null;
  }, []);

  const sessionQuery = useQuery({
    queryKey: ['guest-session-status', sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error('No session ID');
      const token = getToken();
      if (!token) throw new Error('No session token');
      return getGuestSessionStatus(sessionId, token);
    },
    enabled: isReady && !!sessionId,
    refetchInterval: SESSION_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false,
    gcTime: 1000 * 60 * 5, // 5 phút — cleanup stale queries
    throwOnError: false,
  });

  useEffect(() => {
    if (!sessionQuery.data) return;
    onPollDataRef.current({
      donationCount: sessionQuery.data.donationCount,
      remainingDonations: sessionQuery.data.remainingDonations,
      donationQuota: sessionQuery.data.donationQuota,
    });
  }, [sessionQuery.data]);

  const refreshNow = useCallback(() => {
    void sessionQuery.refetch();
  }, [sessionQuery.refetch]);

  return {
    isPolling: sessionQuery.isFetching && isReady && !!sessionId,
    refreshNow,
  };
}
