import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Reintentar solo fallos de red o del servidor, nunca 4xx
      retry: (failureCount, error) => (error?.status ?? 500) >= 500 && failureCount < 2,
    },
  },
});

export function Providers({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
