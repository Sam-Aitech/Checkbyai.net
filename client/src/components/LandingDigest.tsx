import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { TrendingDown, TrendingUp, RefreshCw, Bell, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface DigestData {
  available: boolean;
  type: "overview" | "daily";
  date: string;
  headline: string;
  emotion: string;
  focus: string;
  counts: {
    added: number;
    updated: number;
    removed: number;
  };
  signature: string;
}

function AnimatedCounter({ value, label, icon, color }: { value: number; label: string; icon: React.ReactNode; color: string }) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.3 });
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!inView || value === 0) return;
    let start = 0;
    const duration = 1200;
    const step = Math.max(1, Math.floor(value / 60));
    const interval = setInterval(() => {
      start += step;
      if (start >= value) {
        setDisplayValue(value);
        clearInterval(interval);
      } else {
        setDisplayValue(start);
      }
    }, duration / 60);
    return () => clearInterval(interval);
  }, [inView, value]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ type: "spring", stiffness: 100, damping: 15 }}
      className="text-center"
    >
      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3 ${color}`}>
        {icon}
      </div>
      <div className="text-3xl sm:text-4xl font-bold text-foreground tabular-nums">
        {displayValue.toLocaleString()}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </motion.div>
  );
}

export default function LandingDigest() {
  const { data, isLoading } = useQuery<DigestData>({
    queryKey: ["/api/daily-digest/current"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 });

  if (isLoading) {
    return (
      <section className="py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-2/3 mx-auto" />
            <div className="h-4 bg-muted rounded w-1/2 mx-auto" />
            <div className="flex justify-center gap-12 mt-8">
              <div className="h-20 w-20 bg-muted rounded-xl" />
              <div className="h-20 w-20 bg-muted rounded-xl" />
              <div className="h-20 w-20 bg-muted rounded-xl" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!data?.available) return null;

  const { headline, emotion, counts, date, type } = data;
  const total = counts.added + counts.updated + counts.removed;
  const hasChanges = type === "daily";
  const formattedDate = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const emotionStyles: Record<string, string> = {
    urgency: "from-red-500/10 to-amber-500/5 border-red-500/20",
    informative: "from-blue-500/10 to-emerald-500/5 border-blue-500/20",
    neutral: "from-slate-500/10 to-slate-400/5 border-slate-500/20",
  };
  const borderStyle = emotionStyles[emotion] || emotionStyles.neutral;

  return (
    <section className="py-12 sm:py-16" ref={ref}>
      <div className="max-w-4xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ type: "spring", stiffness: 80, damping: 18 }}
          className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${borderStyle} p-8 sm:p-10`}
        >
          <div className="absolute top-4 right-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Data
            </span>
          </div>

          <div className="text-center mb-8">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              {formattedDate}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
              {headline}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {hasChanges
                ? `${total.toLocaleString()} total changes detected in the UK Home Office Register`
                : `${counts.added.toLocaleString()} sponsors actively monitored on the UK Home Office Register`}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-6 sm:gap-12 mb-8">
            {hasChanges ? (
              <>
                <AnimatedCounter
                  value={counts.removed}
                  label="Revoked"
                  icon={<TrendingDown className="w-5 h-5 text-red-500" />}
                  color="bg-red-500/10"
                />
                <AnimatedCounter
                  value={counts.updated}
                  label="Updated"
                  icon={<RefreshCw className="w-5 h-5 text-amber-500" />}
                  color="bg-amber-500/10"
                />
                <AnimatedCounter
                  value={counts.added}
                  label="New Licences"
                  icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
                  color="bg-emerald-500/10"
                />
              </>
            ) : (
              <>
                <AnimatedCounter
                  value={counts.added}
                  label="Active Licences"
                  icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
                  color="bg-emerald-500/10"
                />
                <AnimatedCounter
                  value={counts.removed}
                  label="Revoked"
                  icon={<TrendingDown className="w-5 h-5 text-red-500" />}
                  color="bg-red-500/10"
                />
                <AnimatedCounter
                  value={counts.updated}
                  label="Changes Today"
                  icon={<RefreshCw className="w-5 h-5 text-amber-500" />}
                  color="bg-amber-500/10"
                />
              </>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/pricing">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-6 font-bold gap-2">
                <Bell className="w-4 h-4" />
                Get Instant Alerts
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground">
              Know within minutes when your sponsor's licence changes
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
