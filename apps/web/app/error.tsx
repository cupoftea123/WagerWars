"use client";

import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
        <p className="text-gray-500 text-sm mb-6">
          {error.message || "An unexpected error occurred."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 px-6 rounded-xl transition-colors text-sm"
          >
            Try again
          </button>
          <Link
            href="/"
            className="bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-gray-300 font-bold py-2.5 px-6 rounded-xl transition-colors text-sm"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
