"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white px-4">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-gray-500 text-sm mb-6">
              {error.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={reset}
              className="bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 px-6 rounded-xl transition-colors text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
