import { motion } from "framer-motion";
import { CheckCircle2, XCircle, ShieldCheck, ShieldX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { COSCheckResult } from "../../../../shared/mis-types";

const spring = { type: "spring" as const, stiffness: 120, damping: 18 };

interface COSCheckPanelProps {
  result: COSCheckResult;
}

export default function COSCheckPanel({ result }: COSCheckPanelProps) {
  const isGenuine = result.verdict === "GENUINE";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <Card className={`border-2 ${isGenuine ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}>
        <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
          {/* Icon */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...spring, delay: 0.1 }}
            className={`w-20 h-20 rounded-full flex items-center justify-center ${
              isGenuine
                ? "bg-success/10"
                : "bg-destructive/10"
            }`}
          >
            {isGenuine ? (
              <ShieldCheck className="w-10 h-10 text-success" />
            ) : (
              <ShieldX className="w-10 h-10 text-destructive" />
            )}
          </motion.div>

          {/* Badge */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...spring, delay: 0.18 }}
            className={`inline-flex items-center gap-2 px-5 py-2 rounded-full font-bold text-lg tracking-wide border ${
              isGenuine
                ? "bg-success/10 text-success border-success/20"
                : "bg-destructive/10 text-destructive border-destructive/20"
            }`}
          >
            {isGenuine ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <XCircle className="w-5 h-5" />
            )}
            {result.verdict}
          </motion.div>

          {/* Reason line */}
          {!isGenuine && result.reason && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.28 }}
              className="text-sm text-red-700 dark:text-red-300 font-medium max-w-sm"
            >
              {result.reason}
            </motion.p>
          )}

          {isGenuine && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.28 }}
              className="text-sm text-emerald-700 dark:text-emerald-300 font-medium"
            >
              Document passed all authenticity checks.
            </motion.p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
