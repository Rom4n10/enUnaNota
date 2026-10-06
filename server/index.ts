import express from "express";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { api } from "./api.js";
import { registerRooms } from "./rooms.js";

const port = Number(process.env.PORT ?? 3000);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  const server = express();
  server.use(express.json());
  server.get("/healthz", (_req, res) => {
    res.json({ ok: true, uptime: Math.round(process.uptime()) });
  });
  server.use("/api", api);
  server.all(/.*/, (req, res) => {
    handle(req, res);
  });

  const httpServer = createServer(server);
  const io = new Server(httpServer, { path: "/socket.io" });
  registerRooms(io);

  httpServer.listen(port, () => {
    console.log(`> En Una Nota listo en http://localhost:${port} (${dev ? "dev" : "prod"})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
