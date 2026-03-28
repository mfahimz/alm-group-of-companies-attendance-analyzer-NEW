import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
			retry: 2,
			retryDelay: (attemptIndex) => Math.min(2000 * Math.pow(2, attemptIndex), 15000),
			staleTime: 5 * 60 * 1000,
			gcTime: 15 * 60 * 1000,
		},
	},
});