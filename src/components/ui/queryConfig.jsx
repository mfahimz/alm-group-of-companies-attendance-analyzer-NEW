import { QueryClient } from '@tanstack/react-query';

// Global retry logic with exponential backoff
const retryWithBackoff = (failureCount, error) => {
    // Only retry on rate limit errors (429) or network errors
    const isRateLimit = error?.message?.includes('rate limit') || 
                       error?.message?.includes('429') ||
                       error?.status === 429;
    const isNetworkError = error?.message?.includes('network') || 
                          error?.message?.includes('fetch');
    
    if (!isRateLimit && !isNetworkError) {
        return false; // Don't retry other errors
    }
    
    // Retry up to 5 times for rate limits
    return failureCount < 5;
};

const retryDelay = (attemptIndex) => {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max)
    return Math.min(1000 * Math.pow(2, attemptIndex), 16000);
};

// Create optimized query client configuration
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Cache data for 10 minutes to reduce API calls
            staleTime: 10 * 60 * 1000,
            // Keep unused data in cache for 15 minutes
            gcTime: 15 * 60 * 1000,
            // Retry with exponential backoff
            retry: retryWithBackoff,
            retryDelay: retryDelay,
            // Don't refetch automatically - only on explicit invalidation
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchOnMount: false,
            // Deduplicate requests within 2 seconds
            networkMode: 'online',
        },
        mutations: {
            // Retry mutations on rate limits
            retry: retryWithBackoff,
            retryDelay: retryDelay,
        },
    },
});

// Helper to invalidate specific queries with debouncing
const invalidationTimers = {};

export const invalidateQueriesDebounced = (queryClient, queryKey, delay = 500) => {
    const key = JSON.stringify(queryKey);
    
    // Clear existing timer
    if (invalidationTimers[key]) {
        clearTimeout(invalidationTimers[key]);
    }
    
    // Set new timer
    invalidationTimers[key] = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey });
        delete invalidationTimers[key];
    }, delay);
};