"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef } from "react";

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const count = useMotionValue(value);
  const scale = useMotionValue(1);
  const text = useTransform(count, (v) => Math.round(v).toLocaleString("es-AR"));
  const first = useRef(true);

  useEffect(() => {
    const counting = animate(count, value, { duration: 0.6, ease: [0.22, 1, 0.36, 1] });
    if (first.current) {
      first.current = false;
      return () => counting.stop();
    }
    const popping = animate(scale, [1, 1.22, 1], { duration: 0.4 });
    return () => {
      counting.stop();
      popping.stop();
    };
  }, [count, scale, value]);

  return (
    <motion.span className={`inline-block tabular-nums ${className ?? ""}`} style={{ scale }}>
      {text}
    </motion.span>
  );
}
