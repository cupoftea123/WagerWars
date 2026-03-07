import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { config } from "./config.js";
import { MatchManager } from "./game/MatchManager.js";
import { registerHandlers } from "./socket/handlers.js";
import { watchContractEvents } from "./chain/events.js";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./socket/types.js";

const app = express();
const httpServer = http.createServer(app as any);

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST"],
    },
    transports: ["websocket"],
    allowUpgrades: false,
  },
);

const matchManager = new MatchManager();

// Health endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    activeMatches: matchManager.getActiveMatchCount(),
    uptime: process.uptime(),
  });
});

// Socket.io connection handler
io.on("connection", (socket) => {
  console.log(`[Socket] New connection: ${socket.id}`);
  registerHandlers(io, socket, matchManager);
});

// Watch blockchain events for deposit confirmations
watchContractEvents(matchManager, io);

// Start server
httpServer.listen(config.port, () => {
  console.log(`[Server] Wager Wars server listening on port ${config.port}`);
  console.log(`[Server] CORS origin: ${config.corsOrigin}`);
});
