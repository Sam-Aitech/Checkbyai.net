import React from 'react';
import { cn } from '@/lib/utils';
import { ShieldMonitorIcon } from './icons/CheckByAIIcons';

interface BrandLogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'auto';
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function BrandLogo({ 
  className, 
  variant = 'auto', 
  showText = true,
  size = 'md' 
}: BrandLogoProps) {

  // Resolve actual variant based on auto mode
  // In a real app we might use a theme hook here, but for now we'll rely on explicit props or fallback
  const isDark = variant === 'dark' || (variant === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const sizeClasses = {
    sm: { icon: 'w-4 h-4', text: 'text-sm', container: 'gap-1.5' },
    md: { icon: 'w-5 h-5', text: 'text-base', container: 'gap-2' },
    lg: { icon: 'w-7 h-7', text: 'text-xl', container: 'gap-3' }
  };

  return (
    <div className={cn("flex items-center select-none", sizeClasses[size].container, className)}>
      <div className={cn(
        "flex items-center justify-center rounded-lg shadow-sm transition-all duration-300",
        size === 'sm' ? "w-6 h-6 p-1" : size === 'md' ? "w-8 h-8 p-1.5" : "w-10 h-10 p-2",
        // Distinctive icon background styling
        isDark 
          ? "bg-slate-800 border border-slate-700 shadow-slate-900/50" 
          : "bg-white border border-slate-200 shadow-slate-200/50"
      )}>
        <ShieldMonitorIcon className={cn(
          sizeClasses[size].icon, 
          // Custom icon coloring distinct from normal text
          isDark ? "text-indigo-400" : "text-primary"
        )} />
      </div>

      {showText && (
        <span className={cn(
          "font-extrabold tracking-tight",
          sizeClasses[size].text,
          // Premium text gradient styling
          isDark 
            ? "bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400" 
            : "bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600"
        )}>
          CheckByAI
        </span>
      )}
    </div>
  );
}
