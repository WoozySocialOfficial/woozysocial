import * as Sentry from "@sentry/react";
import ReactDOM from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "./contexts/ThemeContext";
import App from "./App";
import "./styles/theme.css";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: "production",
  tracesSampleRate: 0.1,
  beforeSend(event, hint) {
    const error = hint?.originalException;
    const msg = (error?.message || event?.message || '').toLowerCase();
    // Suppress chunk load errors — lazyRetry in App.jsx handles these with a page reload
    if (
      msg.includes('failed to fetch dynamically imported module') ||
      msg.includes('loading chunk') ||
      msg.includes('loading css chunk') ||
      msg.includes('dynamically imported module')
    ) {
      return null; // drop the event
    }
    return event;
  },
});

// Configure React Query with sensible defaults and better error handling
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // Data is fresh for 2 minutes
      gcTime: 1000 * 60 * 10, // Cache kept for 10 minutes (formerly cacheTime)
      refetchOnWindowFocus: false, // Don't refetch when window regains focus
      retry: 2, // Retry failed requests twice before giving up
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
      throwOnError: false, // Don't throw errors to ErrorBoundary - handle them gracefully in components
      useErrorBoundary: false, // Deprecated but keeping for backwards compat
      refetchOnMount: true, // Refetch stale data on mount; staleTime prevents unnecessary refetches
      refetchOnReconnect: true, // Refetch when internet reconnects
    },
    mutations: {
      retry: 1, // Retry mutations once
      throwOnError: false, // Handle mutation errors in components, not ErrorBoundary
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ChakraProvider>
          <App />
        </ChakraProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </HelmetProvider>
);
