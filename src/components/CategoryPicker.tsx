"use client";

import { motion } from "motion/react";
import { useId } from "react";
import type { Category } from "@/lib/types";

type Props = {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
};

export function CategoryPicker({ categories, value, onChange, label = "Categoría" }: Props) {
  const layoutId = useId();
  return (
    <div className="space-y-2.5">
      {label && <p className="eyebrow">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {categories.length === 0 &&
          Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton h-9 w-24 rounded-full" />)}
        {categories.map((c) => {
          const active = c.id === value;
          return (
            <button
              key={c.id}
              type="button"
              data-active={active}
              onClick={() => onChange(c.id)}
              className="chip"
            >
              {active && (
                <motion.span
                  layoutId={layoutId}
                  className="absolute inset-0 rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 500, damping: 34 }}
                />
              )}
              <span className="relative">{c.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
