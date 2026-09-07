export type VerificationResultType = "genuine" | "suspicious" | "fake";
export type VerificationTone = "success" | "warning" | "destructive";

export function getVerificationResultTone(type: VerificationResultType): VerificationTone {
  if (type === "genuine") return "success";
  if (type === "suspicious") return "warning";
  return "destructive";
}

// Tinted-badge classes for the tone — the bg-<tone>/10 text-<tone> border-<tone>/20
// pattern used wherever a verification result is rendered as a small pill/badge.
export const verificationToneBadgeClasses: Record<VerificationTone, string> = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
};

// Softer card-surface variant — bg-<tone>/5 border-<tone>/20, no text color (the
// card's own children set their own text color) — used for a full result panel
// rather than a small badge.
export const verificationToneCardClasses: Record<VerificationTone, string> = {
  success: "bg-success/5 border-success/20",
  warning: "bg-warning/5 border-warning/20",
  destructive: "bg-destructive/5 border-destructive/20",
};
