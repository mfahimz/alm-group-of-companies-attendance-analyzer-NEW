import { QueryClient } from '@tanstack/react-query';
import { isRateLimitError } from '@/lib/rateLimitGuard';

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
			// Smart retry: rate-limit errors get more retries with longer backoff,
			// other errors get standard 2 retries
			retry: (failureCount, error) => {
				if (isRateLimitError(error)) {
					return failureCount < 5; // Up to 5 retries for rate limits
				}
				return failureCount < 2; // Standard 2 retries for other errors
			},
			retryDelay: (attemptIndex, error) => {
				if (isRateLimitError(error)) {
					// Longer exponential backoff for rate limits: 2s, 4s, 8s, 16s, 30s
					return Math.min(2000 * Math.pow(2, attemptIndex), 30000) + Math.random() * 500;
				}
				return Math.min(2000 * Math.pow(2, attemptIndex), 15000);
			},
			staleTime: 5 * 60 * 1000,
			gcTime: 15 * 60 * 1000,
		},
		mutations: {
			// Mutations also get rate-limit retry protection
			retry: (failureCount, error) => {
				if (isRateLimitError(error)) {
					return failureCount < 4;
				}
				return false; // Don't auto-retry non-rate-limit mutation errors
			},
			retryDelay: (attemptIndex) => {
				return Math.min(2000 * Math.pow(2, attemptIndex), 30000) + Math.random() * 500;
			},
		},
	},
});