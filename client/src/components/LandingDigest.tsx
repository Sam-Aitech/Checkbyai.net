import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { STALE_TIMES } from "@/lib/queryDefaults";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { ArrowRight, Bell } from "lucide-react";
import { ShieldMonitorIcon, AlertBellIcon, TripleChannelIcon } from "@/components/icons/CheckByAIIcons";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface DigestData {
  available: boolean;
  type: "overview" | "daily";
  date: string;
  lastPipelineRun: string | null;
  headline: string;
  emotion: string;
  focus: string;
  counts: {
    added: number;
    updated: number;
    removed: number;
  };
  activeSponsors: number;
  signature: string;
}

function AnimatedCounter({ value, label, icon, color, large }: { value: number; label: string; icon: React.ReactNode; color: string; large?: boolean }) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.3 });
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!inView || value === 0) return;
    let start = 0;
    const duration = large ? 1800 : 1200;
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
  }, [inView, value, large]);

  if (large) {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={inView ? { opacity: 1, scale: 1 } : {}}
        transition={{ type: "spring", stiffness: 80, damping: 16, delay: 0.1 }}
        className="text-center mb-6"
      >
        <div className="inline-flex items-center justify-center gap-3 mb-2">
          <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${color}`}>
            {icon}
          </div>
          <span className="text-4xl sm:text-5xl md:text-6xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent tabular-nums tracking-tight">
            {displayValue.toLocaleString()}
          </span>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground font-medium">{label}</p>
      </motion.div>
    );
  }

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
    staleTime: STALE_TIMES.NORMAL,
    refetchInterval: STALE_TIMES.INFREQUENT,
    refetchOnWindowFocus: true,
  });

  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 });

  if (isLoading) {
    return (
      <section className="py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded w-1/3 mx-auto" />
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

  const { headline, emotion, counts, date, lastPipelineRun, type, activeSponsors } = data;
  const total = counts.added + counts.updated + counts.removed;
  const hasChanges = type === "daily";
  const pipelineDate = lastPipelineRun || date;
  const formattedDate = new Date(pipelineDate + "T00:00:00").toLocaleDateString("en-GB", {
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
          <div className="absolute top-4 right-4 flex flex-col items-end gap-1">
            <span className="badge-live">
              <span className="badge-live-dot" />
              Live Data
            </span>
            {formattedDate && (
              <p className="text-[10px] text-muted-foreground">Updated {formattedDate}</p>
            )}
          </div>

          <div className="text-center mb-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
              {formattedDate}
            </p>

            {activeSponsors > 0 && (
              <AnimatedCounter
                value={activeSponsors}
                label="Active Licensed Sponsors on the UK Register"
                icon={<ShieldMonitorIcon size={20} />}
                color="bg-emerald-500/15"
                large
              />
            )}

            <div className="w-16 h-px mx-auto my-5 bg-gradient-to-r from-transparent via-border to-transparent" />

            <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
              {headline}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {hasChanges
                ? `${total.toLocaleString()} total changes detected in the UK Home Office Register`
                : `Monitoring the complete UK Home Office Register of Licensed Sponsors`}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-6 sm:gap-12 mb-8 mt-6">
            {hasChanges ? (
              <>
                <AnimatedCounter
                  value={counts.removed}
                  label="Revoked"
                  icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4 11H8v-2h8v2z" fill="#ef4444" opacity="0.8"/></svg>}
                  color="bg-red-500/10"
                />
                <AnimatedCounter
                  value={counts.updated}
                  label="Updated"
                  icon={<TripleChannelIcon size={20} />}
                  color="bg-amber-500/10"
                />
                <AnimatedCounter
                  value={counts.added}
                  label="New Licences"
                  icon={<ShieldMonitorIcon size={20} />}
                  color="bg-emerald-500/10"
                />
              </>
            ) : (
              <>
                <AnimatedCounter
                  value={counts.added}
                  label="Active Licences"
                  icon={<ShieldMonitorIcon size={20} />}
                  color="bg-emerald-500/10"
                />
                <AnimatedCounter
                  value={counts.removed}
                  label="Revoked"
                  icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4 11H8v-2h8v2z" fill="#ef4444" opacity="0.8"/></svg>}
                  color="bg-red-500/10"
                />
                <AnimatedCounter
                  value={counts.updated}
                  label="Changes Today"
                  icon={<TripleChannelIcon size={20} />}
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
