"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
let clockOffset = 0;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socket.on("connect", syncClock);
  }
  return socket;
}

/** Estimates the server clock offset so every device starts the audio together. */
export function syncClock(samples = 3): void {
  const s = getSocket();
  const results: number[] = [];
  for (let i = 0; i < samples; i++) {
    const sentAt = Date.now();
    s.emit("ping_time", null, (res: { serverTime: number }) => {
      const rtt = Date.now() - sentAt;
      results.push(res.serverTime + rtt / 2 - Date.now());
      if (results.length === samples) {
        results.sort((a, b) => a - b);
        clockOffset = results[Math.floor(results.length / 2)];
      }
    });
  }
}

/** Current time expressed in the server's clock. */
export const serverNow = (): number => Date.now() + clockOffset;

export function subscribeSocketId(listener: () => void): () => void {
  const s = getSocket();
  s.on("connect", listener);
  s.on("disconnect", listener);
  return () => {
    s.off("connect", listener);
    s.off("disconnect", listener);
  };
}

export const socketIdSnapshot = (): string | null => socket?.id ?? null;
