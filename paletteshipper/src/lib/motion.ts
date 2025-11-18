export const easeStandard = [0.22, 1, 0.36, 1] as const;

export const slideInLeft = {
  hidden: { opacity: 0, x: -24 },
  show: { opacity: 1, x: 0, transition: { duration: 0.4, ease: easeStandard } },
};

export const staggerContainer = (stagger = 0.08) => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger } },
});

// Helper to play initial/animate once per mount
export const once = <TInitial extends string | boolean | undefined, TAnimate extends string | undefined>(
  initial: TInitial,
  animate: TAnimate
) => ({ initial, animate });

