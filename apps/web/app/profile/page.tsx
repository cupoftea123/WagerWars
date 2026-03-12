"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import Link from "next/link";
import { useMatchHistory } from "@/hooks/useMatchHistory";
import { WalletButton } from "@/components/WalletButton";

const PAGE_SIZE = 25;

const RESULT_BADGE: Record<string, { bg: string; text: string }> = {
  WIN: { bg: "bg-green-500/10 border border-green-500/20", text: "text-green-400" },
  LOSS: { bg: "bg-red-500/10 border border-red-500/20", text: "text-red-400" },
  DRAW: { bg: "bg-yellow-500/10 border border-yellow-500/20", text: "text-yellow-400" },
  CANCELLED: { bg: "bg-gray-500/10 border border-gray-500/20", text: "text-gray-400" },
};

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const { history, stats, loading, error, isFirstLoad, refresh } = useMatchHistory();
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const pagedHistory = history.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (!isConnected) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-bold text-gray-300">Connect your wallet to view profile</h2>
        <ConnectButton />
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5">
            <span className="text-lg font-black text-white">WAGER</span>
            <span className="text-lg font-black text-gradient-red">WARS</span>
          </Link>
          <div className="w-px h-5 bg-white/10" />
          <span className="text-gray-500 text-sm font-medium">Profile</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/play" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">Play</Link>
          <WalletButton />
        </div>
      </div>

      {/* Wallet Address */}
      <div className="glass-card rounded-2xl p-4 mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-white/[0.08] flex items-center justify-center flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="6" r="3" stroke="#60a5fa" strokeWidth="1.5" fill="none" />
            <path d="M3 16C3 13 6 11 9 11C12 11 15 13 15 16" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        </div>
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Wallet</p>
          <p className="font-mono text-sm text-gray-300">{address}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Matches" value={String(stats.total)} />
        <div className="glass-card rounded-2xl p-5 text-center">
          <div className="text-2xl font-black mb-1">
            <span className="text-green-400">{stats.wins}</span>
            <span className="text-gray-600 mx-1">/</span>
            <span className="text-red-400">{stats.losses}</span>
            <span className="text-gray-600 mx-1">/</span>
            <span className="text-yellow-400">{stats.draws}</span>
          </div>
          <div className="text-gray-500 text-[10px] uppercase tracking-wider">W / L / D</div>
        </div>
        {(() => {
          const played = stats.wins + stats.losses;
          const winRate = played > 0 ? Math.round((stats.wins / played) * 100) : 0;
          return <StatCard label="Win Rate" value={`${winRate}%`} valueColor={winRate >= 50 ? "text-green-400" : "text-red-400"} />;
        })()}
        {(() => {
          const net = stats.totalEarned - stats.totalWagered;
          const sign = net >= 0 ? "+" : "";
          const color = net >= 0 ? "text-green-400" : "text-red-400";
          return <StatCard label="Total Earned" value={`${sign}$${Math.abs(net).toFixed(2)}`} valueColor={color} />;
        })()}
      </div>

      {/* Match History */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">Match History</h2>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-gray-500 hover:text-white text-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading && <div className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />}
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {/* First load banner */}
        {isFirstLoad && loading && (
          <div className="mb-4 rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-3 flex items-start gap-3">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-400 text-sm font-medium">First time loading</p>
              <p className="text-blue-400/60 text-xs mt-0.5">Scanning blockchain history — this may take up to a minute. Future visits will be instant.</p>
            </div>
          </div>
        )}

        {error ? (
          <div className="text-center py-8">
            <div className="text-red-400 text-sm mb-2">Failed to load history</div>
            <div className="text-gray-600 text-xs mb-3 font-mono">{error}</div>
            <button onClick={refresh} className="text-blue-400 hover:text-blue-300 text-sm transition-colors">Retry</button>
          </div>
        ) : loading && history.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Loading match history...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 21s-7-5-7-10a4 4 0 017-3 4 4 0 017 3c0 5-7 10-7 10z" stroke="#6b7280" strokeWidth="1.5" fill="none"/>
              </svg>
            </div>
            <div className="text-gray-500 text-sm mb-4">No matches yet</div>
            <Link
              href="/play"
              className="inline-block bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-sm py-2 px-6 rounded-xl transition-all"
            >
              Enter Arena
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-[10px] uppercase tracking-wider border-b border-white/[0.05]">
                  <th className="py-3 text-left font-medium">Date</th>
                  <th className="py-3 text-left font-medium">Opponent</th>
                  <th className="py-3 text-center font-medium">Result</th>
                  <th className="py-3 text-right font-medium">Wager</th>
                  <th className="py-3 text-right font-medium">Payout</th>
                  <th className="py-3 text-right font-medium">Tx</th>
                </tr>
              </thead>
              <tbody>
                {pagedHistory.map((entry) => {
                  const badge = RESULT_BADGE[entry.result] || RESULT_BADGE.CANCELLED;
                  return (
                    <tr key={entry.txHash} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 text-gray-400 text-xs">
                        {new Date(entry.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-3 font-mono text-gray-400 text-xs">
                        {entry.opponent.slice(0, 6)}...{entry.opponent.slice(-4)}
                      </td>
                      <td className="py-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                          {entry.result}
                        </span>
                      </td>
                      <td className="py-3 text-right text-gray-400 text-xs">${entry.wager.toFixed(2)}</td>
                      <td className="py-3 text-right text-xs">
                        {entry.payout > 0
                          ? <span className="text-green-400">${entry.payout.toFixed(2)}</span>
                          : <span className="text-gray-600">-</span>
                        }
                      </td>
                      <td className="py-3 text-right">
                        <a
                          href={`https://testnet.snowtrace.io/tx/${entry.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 text-xs transition-colors inline-flex items-center gap-1"
                        >
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5 1H2C1.45 1 1 1.45 1 2v10c0 .55.45 1 1 1h10c.55 0 1-.45 1-1V9M8 1h5v5M13 1L6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          View
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.05]">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-gray-500 hover:text-white text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  &larr; Previous
                </button>
                <span className="text-gray-500 text-xs">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="text-gray-500 hover:text-white text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next &rarr;
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, valueColor = "text-white" }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="glass-card rounded-2xl p-5 text-center">
      <div className={`text-2xl font-black mb-1 ${valueColor}`}>{value}</div>
      <div className="text-gray-500 text-[10px] uppercase tracking-wider">{label}</div>
    </div>
  );
}
