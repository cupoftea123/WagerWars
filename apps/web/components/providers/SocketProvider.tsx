"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { type Socket } from "socket.io-client";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { useAccount, useSignMessage } from "wagmi";

const AUTH_STORAGE_KEY = "wager-wars-auth";

interface StoredAuth {
  address: string;
  signature: string;
  message: string;
}

function getStoredAuth(address: string): StoredAuth | null {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredAuth;
    // Only reuse if address matches (user didn't switch wallets)
    if (data.address.toLowerCase() !== address.toLowerCase()) return null;
    return data;
  } catch {
    return null;
  }
}

function saveAuth(data: StoredAuth): void {
  try {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage might be unavailable
  }
}

function clearAuth(): void {
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  isAuthenticated: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  isAuthenticated: false,
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { address, isConnected: walletConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Connect socket when wallet connects
  useEffect(() => {
    if (!walletConnected || !address) {
      disconnectSocket();
      setIsConnected(false);
      setIsAuthenticated(false);
      return;
    }

    const s = connectSocket();
    setSocket(s);

    s.on("connect", () => {
      setIsConnected(true);

      // Try stored auth first (avoids re-signing on page refresh)
      const stored = getStoredAuth(address);
      if (stored) {
        s.emit("authenticate", stored);
        return;
      }

      // No stored auth — request new signature
      const message = `Wager Wars Authentication\nAddress: ${address}\nTimestamp: ${Date.now()}`;
      signMessageAsync({ message })
        .then((signature) => {
          const authData = { address, signature, message };
          s.emit("authenticate", authData);
          saveAuth(authData);
        })
        .catch(() => {
          console.error("Failed to sign auth message");
        });
    });

    s.on("authenticated", ({ success }) => {
      if (success) {
        setIsAuthenticated(true);
      } else {
        // Stored signature rejected — clear and request new one
        clearAuth();
        setIsAuthenticated(false);
        const message = `Wager Wars Authentication\nAddress: ${address}\nTimestamp: ${Date.now()}`;
        signMessageAsync({ message })
          .then((signature) => {
            const authData = { address, signature, message };
            s.emit("authenticate", authData);
            saveAuth(authData);
          })
          .catch(() => {
            console.error("Failed to sign auth message");
          });
      }
    });

    s.on("disconnect", () => {
      setIsConnected(false);
      setIsAuthenticated(false);
    });

    return () => {
      s.off("connect");
      s.off("authenticated");
      s.off("disconnect");
    };
  }, [walletConnected, address, signMessageAsync]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, isAuthenticated }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
