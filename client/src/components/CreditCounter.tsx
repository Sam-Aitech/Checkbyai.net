import { useQuery } from '@tanstack/react-query';
import { Infinity } from 'lucide-react';
import { getQueryFn } from '@/lib/queryClient';
import { CreditCoinIcon } from '@/components/icons/CheckByAIIcons';
import { motion } from 'framer-motion';

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
        <CreditCoinIcon size={16} />
        {isUnlimited ? (
          <Infinity className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : (
          <span className="font-medium">{credits}</span>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 160, damping: 18 }}
      className={`inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-50/80 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded-xl text-sm backdrop-blur-sm border border-blue-200/50 dark:border-blue-800/40 shadow-sm ${className}`}
    >
      <CreditCoinIcon size={16} />
      {isUnlimited ? (
        <span className="flex items-center gap-1">
          <Infinity className="w-4 h-4" />
          <span className="font-semibold">Unlimited</span>
        </span>
      ) : (
        <span>
          <span className="font-bold">{credits}</span>
          <span className="opacity-70 ml-1 text-xs">credits</span>
        </span>
      )}
    </motion.div>
  );
}
