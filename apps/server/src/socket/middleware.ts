import { verifyMessage } from "viem";
import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./types.js";

type WagerSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Socket middleware: verifies wallet signature for authentication.
 * After calling "authenticate", the socket's data.address is set.
 */
export function setupAuth(
  socket: WagerSocket,
  onAuthenticated?: (address: string) => void,
): void {
  socket.on("authenticate", async ({ address, signature, message }) => {
    try {
      const valid = await verifyMessage({
        address: address as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });

      if (valid) {
        socket.data.address = address.toLowerCase();
        socket.emit("authenticated", { success: true });
        onAuthenticated?.(address.toLowerCase());
        console.log(`[Auth] ${address} authenticated`);
      } else {
        socket.emit("authenticated", { success: false, error: "Invalid signature" });
      }
    } catch (err) {
      socket.emit("authenticated", { success: false, error: "Verification failed" });
    }
  });
}

/** Helper: check if socket is authenticated */
export function requireAuth(socket: WagerSocket): string | null {
  return socket.data.address ?? null;
}
