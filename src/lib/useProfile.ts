"use client";

import { useSyncExternalStore } from "react";
import { getProfile, serverProfile, subscribeProfile, type Profile } from "./storage";

/** Reads the locally stored profile without touching localStorage during SSR. */
export function useProfile(): Profile {
  return useSyncExternalStore(subscribeProfile, getProfile, serverProfile);
}
