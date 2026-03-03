import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000, // 1 minute
    enabled: true, // Always try once
    throwOnError: false, // Don't throw on 401 errors
  });

  // Consider 401 as "not authenticated" rather than an error
  const isAuthenticated = !!user && !error;
  
  return {
    user,
    isLoading: isLoading && !error, // Don't show loading if we know it's a 401
    isAuthenticated,
    isAdmin: user?.role === 'admin',
    isPro: ['starter', 'pro', 'unlimited', 'enterprise'].includes(user?.subscriptionStatus || ''),
  };
}