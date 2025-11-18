// AIExtractionSpinner.tsx
import React from "react";
import { motion, useReducedMotion } from "motion/react";

export type AIExtractionSpinnerProps = {
  /** Diameter of the spinner in pixels */
  size?: number;
  /** Ring thickness in pixels */
  thickness?: number;
  /** Seconds per rotation for the outer ring (smaller = faster) */
  outerDuration?: number;
  /** Seconds per rotation for the inner ring (smaller = faster) */
  innerDuration?: number;
  /** Primary brand color (top arc of outer ring) */
  primaryColor?: string;
  /** Accent brand color (right arc of outer ring) */
  accentColor?: string;
  /** Optional label text shown under the spinner */
  label?: string;
  /** Optional sublabel text shown under the label */
  sublabel?: string;
  /** Hide all text below the spinner */
  hideText?: boolean;
  /** Add a soft glow around the spinner */
  glow?: boolean;
  /** Pause animation (rings stop spinning) */
  paused?: boolean;
  /** Extra className for the outer wrapper */
  className?: string;
  /** Accessible label for screen readers */
  ariaLabel?: string;
};

const AIExtractionSpinner: React.FC<AIExtractionSpinnerProps> = ({
  size = 160,
  thickness = 6,
  outerDuration = 1.4, // fast per your latest spec
  innerDuration = 2.1,
  primaryColor = "#8412FF", // Palette Purple-500
  accentColor = "#00AAAB",  // Palette Teal-500
  label = "Extracting with AI…",
  sublabel = "Scanning documents",
  hideText = false,
  glow = true,
  paused = false,
  className = "",
  ariaLabel = "Loading",
}) => {
  const prefersReducedMotion = useReducedMotion();
  const rotateOuter = paused || prefersReducedMotion ? {} : { rotate: 360 };
  const rotateInner = paused || prefersReducedMotion ? {} : { rotate: -360 };

  const ringBase = "#F0E6FF";
  const innerBase = "#F8F5FF";
  const innerAccentA = "#B587E8";
  const innerAccentB = "#C8A7FF";

  const baseInitial = prefersReducedMotion ? undefined : { opacity: 0, scale: 0.2 };
  const baseAnimate = prefersReducedMotion ? undefined : { opacity: 1, scale: 1 };
  const baseExit = prefersReducedMotion ? undefined : { opacity: 0, scale: 0.2 };
  const baseTransition = prefersReducedMotion
    ? undefined
    : { type: 'spring', stiffness: 260, damping: 22, mass: 0.6 };

  return (
    <motion.div
      className={`inline-flex flex-col items-center justify-center ${className}`}
      role="status"
      aria-label={ariaLabel}
      aria-live="polite"
      style={{ minWidth: size, minHeight: size, transformOrigin: 'center' }}
      initial={baseInitial}
      animate={baseAnimate}
      exit={baseExit}
      transition={baseTransition}
    >
      <div style={{ position: "relative", width: size, height: size }}>
        {/* Outer rotating ring */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "9999px",
            border: `${thickness}px solid ${ringBase}`,
            borderTopColor: primaryColor,
            borderRightColor: accentColor,
            boxShadow: glow ? "0 0 40px rgba(132,18,255,0.25)" : undefined,
          }}
          animate={rotateOuter}
          transition={{
            repeat: Infinity,
            duration: outerDuration,
            ease: "linear",
          }}
        />

        {/* Inner counter-rotating ring */}
        <motion.div
          style={{
            position: "absolute",
            inset: thickness * 1.5,
            borderRadius: "9999px",
            border: `${thickness}px solid ${innerBase}`,
            borderBottomColor: innerAccentA,
            borderLeftColor: innerAccentB,
          }}
          animate={rotateInner}
          transition={{
            repeat: Infinity,
            duration: innerDuration,
            ease: "linear",
          }}
        />
      </div>

      {!hideText && (
        <>
          <p
            style={{
              marginTop: 12,
              fontSize: 14,
              fontWeight: 600,
              color: "#170849",
            }}
          >
            {label}
          </p>
          {sublabel && (
            <p
              style={{
                marginTop: 2,
                fontSize: 12,
                opacity: 0.7,
                color: "#170849",
              }}
            >
              {sublabel}
            </p>
          )}
        </>
      )}
    </motion.div>
  );
};

export default AIExtractionSpinner;

/*
USAGE EXAMPLE
-------------
import AIExtractionSpinner from "./AIExtractionSpinner";

<AIExtractionSpinner
  size={160}
  thickness={6}
  outerDuration={1.2}
  innerDuration={1.8}
  label="Extracting with AI…"
  sublabel="Final checks"
  glow
/>
*/
