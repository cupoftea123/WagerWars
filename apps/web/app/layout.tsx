import type { Metadata } from "next";
import dynamic from "next/dynamic";
import "./globals.css";

const Web3Provider = dynamic(
  () => import("@/components/providers/Web3Provider").then((m) => m.Web3Provider),
  { ssr: false }
);
const SocketProvider = dynamic(
  () => import("@/components/providers/SocketProvider").then((m) => m.SocketProvider),
  { ssr: false }
);
const RematchToast = dynamic(
  () => import("@/components/RematchToast").then((m) => m.RematchToast),
  { ssr: false }
);
const ActiveMatchToast = dynamic(
  () => import("@/components/ActiveMatchToast").then((m) => m.ActiveMatchToast),
  { ssr: false }
);

export const metadata: Metadata = {
  title: "Wager Wars",
  description: "Competitive 1v1 onchain duel game. Wager, battle, win.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>
          <SocketProvider>
            <div className="min-h-screen flex flex-col">
              {children}
            </div>
            <RematchToast />
            <ActiveMatchToast />
          </SocketProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
