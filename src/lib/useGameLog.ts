"use client";

import { useEffect, useRef } from "react";
import { logGame } from "./api";

type Payload = { mode: string; categoryId?: string; score?: number };

/** Records one finished game each time `over` flips to true. */
export function useGameLog(over: boolean, payload: Payload): void {
  const latest = useRef(payload);
  useEffect(() => {
    latest.current = payload;
  });
  useEffect(() => {
    if (over) logGame(latest.current).catch(() => undefined);
  }, [over]);
}
