"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex-1">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-40 bg-[#0a0a0a]/80 backdrop-blur-lg border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5">
            <span className="text-sm font-black text-white">WAGER</span>
            <span className="text-sm font-black text-gradient-red">WARS</span>
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/play" className="text-gray-400 hover:text-white transition-colors">Play</Link>
            <Link href="/profile" className="text-gray-400 hover:text-white transition-colors">Profile</Link>
            <Link
              href="/play"
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-1.5 rounded-lg transition-colors"
            >
              Enter Arena
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-[90vh] flex flex-col items-center justify-center px-4 relative overflow-hidden pt-14">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 40%, transparent 70%)" }} />
        {/* Grid pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

        <div className="text-center max-w-3xl relative z-10 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-1.5 mb-8">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-gray-400 font-medium">Built on Avalanche</span>
          </div>

          <h1 className="text-7xl md:text-8xl font-black tracking-tight mb-6">
            WAGER <span className="text-gradient-red">WARS</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-400 mb-4 max-w-xl mx-auto">
            Competitive 1v1 onchain duels
          </p>
          <p className="text-gray-500 mb-10 max-w-lg mx-auto">
            Wager USDC, battle 7 rounds of strategic combat with simultaneous moves, winner takes the pot. Only 2 transactions per match.
          </p>

          <div className="flex flex-col items-center gap-4">
            <Link
              href="/play"
              className="inline-block bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-lg py-4 px-12 rounded-xl transition-all shadow-lg shadow-red-900/30 hover:-translate-y-0.5 animate-pulse-glow"
            >
              Play Now
            </Link>
            <Link
              href="/play?demo=true"
              className="text-gray-500 hover:text-gray-300 text-sm font-medium transition-colors border-b border-gray-700 hover:border-gray-500 pb-0.5"
            >
              Try Demo — Play against a bot (no USDC needed)
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            How It <span className="text-gradient-red">Works</span>
          </h2>
          <p className="text-gray-500 text-center mb-16 max-w-md mx-auto text-sm">
            Three steps. Two transactions. One winner.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StepCard
              step={1}
              title="Connect Wallet"
              description="Link your wallet and authenticate with a signature. No passwords, no accounts."
              icon={<WalletIcon />}
            />
            <StepCard
              step={2}
              title="Find Opponent"
              description="Create a match with your USDC wager or join an existing one. Smart contract holds the funds."
              icon={<SearchIcon />}
            />
            <StepCard
              step={3}
              title="Battle & Win"
              description="7 rounds of strategic combat. Outsmart your opponent, take the pot. Payouts are instant."
              icon={<TrophyIcon />}
            />
          </div>
        </div>
      </section>

      {/* Game Mechanics */}
      <section className="py-24 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-500/[0.02] to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Game <span className="text-gradient-red">Mechanics</span>
          </h2>
          <p className="text-gray-500 text-center mb-16 max-w-lg mx-auto text-sm">
            Four actions, seven rounds, one winner. Every move matters.
          </p>

          {/* Actions Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
            <ActionCard name="Strike" cost="3 Energy" effect="5 damage" color="orange" detail="Basic attack. Beats Break, blocked by Shield." icon={<StrikeSmall />} />
            <ActionCard name="Shield" cost="2 Energy" effect="Block" color="blue" detail="Blocks Strike. Beaten by Break." icon={<ShieldSmall />} />
            <ActionCard name="Break" cost="4 Energy" effect="3 damage" color="purple" detail="Penetrates Shield. Beaten by Strike." icon={<BreakSmall />} />
            <ActionCard name="Recover" cost="0 Energy" effect="+4 Energy" color="green" detail="Restore energy. Vulnerable: Strike deals 2x." icon={<RecoverSmall />} />
          </div>

          {/* Interaction Matrix */}
          <div className="glass-card rounded-2xl p-6 md:p-8 mb-16">
            <h3 className="text-lg font-bold mb-6 text-center text-gray-300">Interaction Matrix</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-3 text-left text-gray-500 text-xs uppercase">You / Opp</th>
                    <th className="p-3 text-center text-orange-400 text-xs">Strike</th>
                    <th className="p-3 text-center text-blue-400 text-xs">Shield</th>
                    <th className="p-3 text-center text-purple-400 text-xs">Break</th>
                    <th className="p-3 text-center text-green-400 text-xs">Recover</th>
                  </tr>
                </thead>
                <tbody>
                  <MatrixRow action="Strike" color="text-orange-400" cells={["5 vs 5", "Blocked", "5 vs 3", "10 dmg!"]} highlights={[false, true, false, true]} />
                  <MatrixRow action="Shield" color="text-blue-400" cells={["Block", "Nothing", "3 dmg", "Nothing"]} highlights={[false, false, true, false]} />
                  <MatrixRow action="Break" color="text-purple-400" cells={["5 vs 3", "3 dmg", "3 vs 3", "3 dmg"]} highlights={[true, false, false, false]} />
                  <MatrixRow action="Recover" color="text-green-400" cells={["10 dmg!", "+4E", "3 dmg", "+4E"]} highlights={[true, false, true, false]} />
                </tbody>
              </table>
            </div>
          </div>

          {/* Round Modifiers */}
          <h3 className="text-lg font-bold mb-2 text-center text-gray-300">Round Modifiers</h3>
          <p className="text-gray-500 text-center mb-8 text-xs max-w-md mx-auto">
            4 of 6 rounds have modifiers. Round 1 is always neutral. Deduce remaining modifiers as the game progresses.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ModifierCard name="Power Surge" effect="All damage doubled" color="text-red-400" bgColor="bg-red-500/5 border-red-500/20" icon={<ZapIcon />} />
            <ModifierCard name="Overcharge" effect="Recover grants +6 energy" color="text-green-400" bgColor="bg-green-500/5 border-green-500/20" icon={<BatteryIcon />} />
            <ModifierCard name="Reflect" effect="Shield reflects 3 damage" color="text-cyan-400" bgColor="bg-cyan-500/5 border-cyan-500/20" icon={<MirrorIcon />} />
            <ModifierCard name="Tax" effect="All actions cost +1 energy" color="text-yellow-400" bgColor="bg-yellow-500/5 border-yellow-500/20" icon={<CoinsIcon />} />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard value="7" label="Rounds per Match" />
            <StatCard value="4" label="Strategic Actions" />
            <StatCard value="2" label="On-chain Transactions" />
            <StatCard value="3%" label="Protocol Fee" />
          </div>
        </div>
      </section>

      {/* Resources */}
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">
            Resources & <span className="text-gradient-red">Strategy</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ResourceCard
              title="Health Points"
              description="Start with 20 HP. Reach 0 and you lose instantly (KO). After 7 rounds, highest HP wins."
              highlight="20 HP"
              icon={<HPIcon />}
            />
            <ResourceCard
              title="Energy"
              description="Start with 10 Energy. Actions cost energy. Passive +1 regen from round 2. No cap — stack it up with Recover."
              highlight="10 Energy"
              icon={<EnergyIcon />}
            />
          </div>
          <div className="glass-card rounded-2xl p-6 mt-6">
            <h3 className="text-sm font-bold text-gray-300 mb-4 uppercase tracking-wider">Win Conditions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <WinCondition label="KO" description="Opponent hits 0 HP" color="text-red-400" />
              <WinCondition label="HP Lead" description="Most HP after 7 rounds" color="text-green-400" />
              <WinCondition label="Energy Tiebreak" description="If HP tied, most energy" color="text-blue-400" />
              <WinCondition label="Draw" description="Both get full refund" color="text-yellow-400" />
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-24 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to <span className="text-gradient-red">Battle</span>?
          </h2>
          <p className="text-gray-500 mb-8">
            Connect your wallet, pick your wager, and prove your skill.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/play"
              className="inline-block bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-lg py-4 px-10 rounded-xl transition-all shadow-lg shadow-red-900/30 hover:-translate-y-0.5 animate-pulse-glow"
            >
              Enter the Arena
            </Link>
            <Link
              href="/play?demo=true"
              className="inline-block bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] text-white font-bold text-lg py-4 px-10 rounded-xl transition-all"
            >
              Try Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/[0.05]">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-1.5">
            <span className="font-black text-gray-500">WAGER</span>
            <span className="font-black text-gradient-red">WARS</span>
            <span className="text-gray-600 ml-2">Built on Avalanche</span>
          </div>
          <div className="flex gap-6">
            <Link href="/play" className="hover:text-gray-400 transition-colors">Play</Link>
            <Link href="/profile" className="hover:text-gray-400 transition-colors">Profile</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* ---------- Sub-components ---------- */

function StepCard({ step, title, description, icon }: { step: number; title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-6 text-center group hover:bg-white/[0.05] transition-all">
      <div className="w-12 h-12 rounded-xl bg-red-600/10 border border-red-600/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-red-600/20 transition-colors">
        {icon}
      </div>
      <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Step {step}</div>
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-gray-500 text-sm">{description}</p>
    </div>
  );
}

function ActionCard({ name, cost, effect, color, detail, icon }: {
  name: string; cost: string; effect: string; color: string; detail: string; icon: React.ReactNode;
}) {
  const borderMap: Record<string, string> = {
    orange: "border-orange-500/20 hover:border-orange-500/40 bg-orange-500/[0.03]",
    blue: "border-blue-500/20 hover:border-blue-500/40 bg-blue-500/[0.03]",
    purple: "border-purple-500/20 hover:border-purple-500/40 bg-purple-500/[0.03]",
    green: "border-green-500/20 hover:border-green-500/40 bg-green-500/[0.03]",
  };
  const textMap: Record<string, string> = {
    orange: "text-orange-400", blue: "text-blue-400", purple: "text-purple-400", green: "text-green-400",
  };

  return (
    <div className={`rounded-2xl border p-5 transition-all ${borderMap[color]}`}>
      <div className="mb-3">{icon}</div>
      <h3 className={`text-lg font-bold mb-1 ${textMap[color]}`}>{name}</h3>
      <div className="text-xs text-gray-500 mb-2">{cost} &rarr; {effect}</div>
      <p className="text-gray-500 text-xs">{detail}</p>
    </div>
  );
}

function ModifierCard({ name, effect, color, bgColor, icon }: {
  name: string; effect: string; color: string; bgColor: string; icon: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 text-center transition-all ${bgColor}`}>
      <div className="mb-2 flex justify-center">{icon}</div>
      <h4 className={`font-bold text-sm mb-1 ${color}`}>{name}</h4>
      <p className="text-gray-500 text-xs">{effect}</p>
    </div>
  );
}

function MatrixRow({ action, color, cells, highlights }: { action: string; color: string; cells: string[]; highlights: boolean[] }) {
  return (
    <tr className="border-t border-white/[0.04]">
      <td className={`p-3 font-bold text-xs ${color}`}>{action}</td>
      {cells.map((cell, i) => (
        <td key={i} className={`p-3 text-center text-xs ${highlights[i] ? "text-red-400 font-bold" : "text-gray-500"}`}>{cell}</td>
      ))}
    </tr>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="glass-card rounded-2xl p-6 text-center">
      <div className="text-4xl font-black text-white mb-2">{value}</div>
      <div className="text-gray-500 text-xs uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ResourceCard({ title, description, highlight, icon }: { title: string; description: string; highlight: string; icon: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <h3 className="text-lg font-bold">{title}</h3>
      </div>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  );
}

function WinCondition({ label, description, color }: { label: string; description: string; color: string }) {
  return (
    <div className="text-center">
      <div className={`font-bold mb-1 ${color}`}>{label}</div>
      <div className="text-gray-500 text-xs">{description}</div>
    </div>
  );
}

/* ---------- SVG Icons ---------- */

function WalletIcon() {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="12" rx="2" stroke="#ef4444" strokeWidth="1.5" fill="none"/><path d="M14 10h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function SearchIcon() {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="5" stroke="#ef4444" strokeWidth="1.5" fill="none"/><line x1="13" y1="13" x2="17" y2="17" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function TrophyIcon() {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M6 3h8v6c0 2.2-1.8 4-4 4s-4-1.8-4-4V3z" stroke="#ef4444" strokeWidth="1.5" fill="none"/><path d="M6 5H4c0 2 1 3 2 3M14 5h2c0 2-1 3-2 3" stroke="#ef4444" strokeWidth="1.5" fill="none"/><line x1="10" y1="13" x2="10" y2="16" stroke="#ef4444" strokeWidth="1.5"/><line x1="7" y1="17" x2="13" y2="17" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function HPIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-5-7-10a4 4 0 017-3 4 4 0 017 3c0 5-7 10-7 10z" fill="#ef4444" opacity="0.6"/></svg>;
}
function EnergyIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#3b82f6" opacity="0.6"/></svg>;
}
function StrikeSmall() {
  return <svg width="28" height="28" viewBox="0 0 64 64" fill="none"><path d="M46 6L50 10 24 38 18 34Z" fill="#f97316"/><rect x="14" y="34" width="16" height="4" rx="1" transform="rotate(-40 22 36)" fill="#d97706"/><path d="M16 38L19 41 11 50 8 47Z" fill="#92400e"/></svg>;
}
function ShieldSmall() {
  return <svg width="28" height="28" viewBox="0 0 64 64" fill="none"><path d="M32 6L52 14 50 36C48 48 40 54 32 58 24 54 16 48 14 36L12 14Z" fill="#3b82f6"/><path d="M32 18L42 24 32 44 22 24Z" fill="#1e40af" opacity="0.5"/></svg>;
}
function BreakSmall() {
  return <svg width="28" height="28" viewBox="0 0 64 64" fill="none"><path d="M22 20C22 16 26 14 30 14H42C46 14 48 18 48 22V30C48 34 46 36 42 36H28L22 42V36C20 34 18 30 18 26Z" fill="#a855f7"/><line x1="10" y1="16" x2="16" y2="20" stroke="#e9d5ff" strokeWidth="2" strokeLinecap="round" opacity="0.8"/><line x1="8" y1="28" x2="16" y2="28" stroke="#e9d5ff" strokeWidth="2" strokeLinecap="round" opacity="0.6"/></svg>;
}
function RecoverSmall() {
  return <svg width="28" height="28" viewBox="0 0 64 64" fill="none"><path d="M32 12C44 12 52 20 52 32 52 44 44 52 32 52 22 52 14 46 13 36" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.6"/><rect x="29" y="24" width="6" height="16" rx="1.5" fill="#4ade80"/><rect x="24" y="29" width="16" height="6" rx="1.5" fill="#4ade80"/></svg>;
}
function ZapIcon() {
  return <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M9 1L3 9h5l-1 6 7-8H9l1-6z" fill="#ef4444" opacity="0.8"/></svg>;
}
function BatteryIcon() {
  return <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><rect x="4" y="3" width="8" height="10" rx="1" stroke="#22c55e" strokeWidth="1.5" fill="none"/><rect x="6" y="1" width="4" height="2" rx="0.5" fill="#22c55e"/><rect x="6" y="6" width="4" height="4" rx="0.5" fill="#22c55e" opacity="0.6"/></svg>;
}
function MirrorIcon() {
  return <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M4 2L12 8 4 14Z" stroke="#06b6d4" strokeWidth="1.5" fill="none" strokeLinejoin="round"/><path d="M8 5L12 8 8 11" stroke="#06b6d4" strokeWidth="1" opacity="0.5"/></svg>;
}
function CoinsIcon() {
  return <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><circle cx="5.5" cy="7" r="3.5" stroke="#eab308" strokeWidth="1.3" fill="none"/><text x="5.5" y="9" textAnchor="middle" fill="#eab308" fontSize="5" fontWeight="bold">$</text><circle cx="10.5" cy="9" r="3.5" stroke="#eab308" strokeWidth="1.3" fill="none"/><text x="10.5" y="11" textAnchor="middle" fill="#eab308" fontSize="5" fontWeight="bold">$</text></svg>;
}
