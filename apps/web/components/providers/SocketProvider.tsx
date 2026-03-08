"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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
  needsSignature: boolean;
  requestSignature: () => void;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  isAuthenticated: false,
  needsSignature: false,
  requestSignature: () => {},
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsSignature, setNeedsSignature] = useState(false);
  const { address, isConnected: walletConnected, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Detect if using WalletConnect (mobile wallets)
  const isWalletConnect = connector?.id === "walletConnect";

  const doSign = useCallback((s: Socket, addr: string) => {
    const message = `Wager Wars Authentication\nAddress: ${addr}\nTimestamp: ${Date.now()}`;
    setNeedsSignature(false);
    signMessageAsync({ message })
      .then((signature) => {
        const authData = { address: addr, signature, message };
        s.emit("authenticate", authData);
        saveAuth(authData);
      })
      .catch(() => {
        console.error("Failed to sign auth message");
        // If signing failed (user rejected or wallet didn't open), allow retry
        setNeedsSignature(true);
      });
  }, [signMessageAsync]);

  // Manual sign trigger (for mobile wallet users)
  const requestSignature = useCallback(() => {
    if (socket?.connected && address) {
      doSign(socket, address);
    }
  }, [socket, address, doSign]);

  // Connect socket when wallet connects
  useEffect(() => {
    if (!walletConnected || !address) {
      disconnectSocket();
      setIsConnected(false);
      setIsAuthenticated(false);
      setNeedsSignature(false);
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

      // For WalletConnect (mobile), don't auto-sign — show button instead
      // Auto-signing fires before the wallet app is ready, causing the request to be lost
      if (isWalletConnect) {
        setNeedsSignature(true);
        return;
      }

      // Desktop wallets (MetaMask, etc.) — auto-sign works fine
      doSign(s, address);
    });

    s.on("authenticated", ({ success }) => {
      if (success) {
        setIsAuthenticated(true);
        setNeedsSignature(false);
      } else {
        // Stored signature rejected — clear and retry
        clearAuth();
        setIsAuthenticated(false);
        if (isWalletConnect) {
          setNeedsSignature(true);
        } else {
          doSign(s, address);
        }
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
  }, [walletConnected, address, isWalletConnect, doSign]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, isAuthenticated, needsSignature, requestSignature }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
