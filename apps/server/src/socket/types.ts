import type {
  Action,
  MatchSummary,
  MatchState,
  PlayerSlot,
  RoundModifier,
  RoundResult,
  SettlementData,
} from "@wager-wars/shared";

/** Events sent from client to server */
export interface ClientToServerEvents {
  authenticate: (data: { address: string; signature: string; message: string }) => void;
  create_match: (data: { wagerAmount: number }) => void;
  join_match: (data: { matchId: string }) => void;
  commit: (data: { matchId: string; commitHash: string }) => void;
  reveal: (data: { matchId: string; action: Action; salt: string }) => void;
  leave_match: (data: { matchId: string }) => void;
  get_open_matches: () => void;
  get_match_state: (data: { matchId: string }) => void;
  get_active_match: () => void;
  request_rematch: (data: { matchId: string }) => void;
  accept_rematch: (data: { matchId: string }) => void;
  decline_rematch: (data: { matchId: string }) => void;
  cancel_match: (data: { matchId: string }) => void;
  forfeit_from_lobby: (data: { matchId: string }) => void;
  start_demo_match: () => void;
}

/** Events sent from server to client */
export interface ServerToClientEvents {
  authenticated: (data: { success: boolean; error?: string }) => void;
  match_created: (data: { matchId: string; onChainMatchId: string; wagerAmount: number; isDemo?: boolean }) => void;
  match_joined: (data: { matchId: string; opponent: string; onChainMatchId: string; wagerAmount: number }) => void;
  opponent_joined: (data: { matchId: string; opponent: string }) => void;
  deposit_required: (data: { onChainMatchId: string; wagerAmount: number; yourDeposited: boolean; opponentDeposited: boolean }) => void;
  deposit_confirmed: (data: { player: "you" | "opponent" }) => void;
  round_start: (data: {
    round: number;
    modifier: RoundModifier;
    yourHp: number;
    yourEnergy: number;
    opponentHp: number;
    opponentEnergy: number;
    commitTimeout: number;
  }) => void;
  opponent_committed: () => void;
  reveal_phase: () => void;
  round_result: (data: RoundResult) => void;
  match_result: (data: {
    winner: string | null;    // address or null for draw
    winReason: string;
    wagerAmount?: number;
    settlement?: SettlementData;
  }) => void;
  match_started_alert: (data: { matchId: string; wagerAmount: number }) => void;
  match_state: (data: {
    status: string;
    round: number;
    modifier: RoundModifier;
    yourHp: number;
    yourEnergy: number;
    opponentHp: number;
    opponentEnergy: number;
    roundResults: RoundResult[];
    winner: string | null;
    winReason: string | null;
    onChainMatchId?: string;
    wagerAmount?: number;
    playerSlot?: "player1" | "player2";
    isDemo?: boolean;
  }) => void;
  match_cancelled: (data: { matchId: string; reason: string }) => void;
  open_matches: (data: MatchSummary[]) => void;
  active_match: (data: { matchId: string; onChainMatchId: string; wagerAmount: number; status: string; playerSlot: "player1" | "player2" } | null) => void;
  rematch_invite: (data: { matchId: string; fromAddress: string; wagerAmount: number }) => void;
  rematch_waiting: () => void;
  rematch_declined: () => void;
  rematch_created: (data: { matchId: string; onChainMatchId: string; wagerAmount: number }) => void;
  error: (data: { code: string; message: string }) => void;
}

/** Data attached to each socket connection */
export interface SocketData {
  address: string | null;
  currentMatchId: string | null;
  playerSlot: PlayerSlot | null;
}
