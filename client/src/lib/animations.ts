import { useInView } from "react-intersection-observer";

export const spring = { type: "spring" as const, stiffness: 100, damping: 15 };
export const springGentle = { type: "spring" as const, stiffness: 80, damping: 18 };
export const springSnappy = { type: "spring" as const, stiffness: 200, damping: 20 };

export const fadeUp = {
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0 },
};

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
};

export const slideInLeft = {
  initial: { opacity: 0, x: -24 },
  animate: { opacity: 1, x: 0 },
};

export const slideInRight = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
};

export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

export const hoverLift = {
  whileHover: { y: -2, transition: { type: "spring", stiffness: 300, damping: 20 } },
};

export const hoverScale = {
  whileHover: { scale: 1.02, transition: { type: "spring", stiffness: 300, damping: 20 } },
};

export const tapScale = {
  whileTap: { scale: 0.97 },
};

export const buttonInteraction = {
  whileHover: { scale: 1.02, transition: { type: "spring", stiffness: 300, damping: 20 } },
  whileTap: { scale: 0.97 },
};

export function useScrollReveal(threshold = 0.15) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold });
  return { ref, inView };
}
