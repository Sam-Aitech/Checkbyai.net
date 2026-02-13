import { useQuery } from '@tanstack/react-query';
import { CreditCard, Infinity } from 'lucide-react';
import { getQueryFn } from '@/lib/queryClient';

interface CreditsData {
  credits: number;
  subscriptionStatus: string;
  isUnlimited: boolean;
}

interface CreditCounterProps {
  variant?: 'default' | 'compact';
  className?: string;
}

export default function CreditCounter({ variant = 'default', className = '' }: CreditCounterProps) {
  const { data: user } = useQuery<any>({
    queryKey: ['/api/auth/user'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    retry: false,
  });

  const { data: creditsData, isLoading } = useQuery<CreditsData>({
    queryKey: ['/api/credits'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user,
    refetchInterval: 30000,
  });

  if (!user || isLoading) {
    return null;
  }

  const isUnlimited = creditsData?.isUnlimited || creditsData?.subscriptionStatus === 'unlimited' || creditsData?.subscriptionStatus === 'enterprise';
  const credits = creditsData?.credits || 0;

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-1 text-sm ${className}`}>
        <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        {isUnlimited ? (
          <Infinity className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : (
          <span className="font-medium">{credits}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm ${className}`}>
      <CreditCard className="w-4 h-4" />
      {isUnlimited ? (
        <span className="flex items-center gap-1">
          <Infinity className="w-4 h-4" />
          <span className="font-medium">Unlimited</span>
        </span>
      ) : (
        <span>
          <span className="font-bold">{credits}</span>
          <span className="opacity-80 ml-1">credits</span>
        </span>
      )}
    </div>
  );
}
