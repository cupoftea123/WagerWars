// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title WagerWars
 * @notice Escrow contract for 1v1 Wager Wars duels.
 *         Handles USDC deposits, EIP-712 settlement verification, and payouts.
 *
 *         Match lifecycle:
 *         1. Player 1 calls createMatch() — deposits USDC, match status = Open
 *         2. Player 2 calls joinMatch()  — deposits USDC, match status = Funded
 *         3. Game plays out offchain (7 rounds via WebSocket)
 *         4. Server signs settlement result with EIP-712
 *         5. Anyone calls settleMatch() with server signature — funds auto-transferred
 */
contract WagerWars is EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================
    // Types
    // ============================================================

    enum MatchStatus {
        None,       // 0 - does not exist
        Open,       // 1 - created, waiting for opponent
        Funded,     // 2 - both players deposited, game in progress
        Settled,    // 3 - result finalized, funds distributed
        Cancelled   // 4 - cancelled (expired or emergency)
    }

    struct Match {
        address player1;
        address player2;
        uint256 wagerAmount;
        MatchStatus status;
        address winner;        // address(0) if draw
        uint256 createdAt;
        uint256 expiresAt;     // auto-cancel deadline for unfunded matches
    }

    // ============================================================
    // Constants
    // ============================================================

    bytes32 private constant SETTLEMENT_TYPEHASH = keccak256(
        "Settlement(bytes32 matchId,address winner)"
    );

    uint256 public constant MAX_FEE_BPS = 1000; // 10% max fee cap
    uint256 public constant STALE_MATCH_TIMEOUT = 48 hours;

    // ============================================================
    // State
    // ============================================================

    IERC20 public immutable usdc;
    address public settlementSigner;
    uint256 public protocolFeeBps;    // e.g. 300 = 3%
    address public feeRecipient;

    mapping(bytes32 => Match) public matches;
    mapping(address => uint256) public pendingWithdrawals;

    uint256 public totalFeesCollected;

    // ============================================================
    // Events
    // ============================================================

    event MatchCreated(bytes32 indexed matchId, address indexed player1, uint256 wagerAmount);
    event MatchJoined(bytes32 indexed matchId, address indexed player2);
    event MatchSettled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 fee);
    event MatchDraw(bytes32 indexed matchId, uint256 payoutEach, uint256 fee);
    event MatchCancelled(bytes32 indexed matchId, string reason);
    event MatchPayout(bytes32 indexed matchId, address indexed player, uint256 amount);
    event Withdrawal(address indexed player, uint256 amount);

    // ============================================================
    // Errors
    // ============================================================

    error MatchAlreadyExists();
    error MatchNotFound();
    error InvalidMatchStatus(MatchStatus current, MatchStatus expected);
    error CannotJoinOwnMatch();
    error InvalidSignature();
    error InvalidWinner();
    error MatchNotExpired();
    error MatchNotStale();
    error NothingToWithdraw();
    error InvalidFee();
    error ZeroAddress();
    error InvalidWagerAmount();
    error NotMatchCreator();

    // ============================================================
    // Constructor
    // ============================================================

    constructor(
        address _usdc,
        address _settlementSigner,
        uint256 _protocolFeeBps,
        address _feeRecipient
    ) EIP712("WagerWars", "1") Ownable(msg.sender) {
        if (_usdc == address(0)) revert ZeroAddress();
        if (_settlementSigner == address(0)) revert ZeroAddress();
        if (_feeRecipient == address(0)) revert ZeroAddress();
        if (_protocolFeeBps > MAX_FEE_BPS) revert InvalidFee();

        usdc = IERC20(_usdc);
        settlementSigner = _settlementSigner;
        protocolFeeBps = _protocolFeeBps;
        feeRecipient = _feeRecipient;
    }

    // ============================================================
    // Core Functions
    // ============================================================

    /**
     * @notice Player 1 creates a match and deposits their wager.
     * @param matchId Unique match identifier (server-generated, hashed to bytes32)
     * @param wagerAmount USDC amount to wager (6 decimals)
     */
    function createMatch(bytes32 matchId, uint256 wagerAmount) external {
        if (wagerAmount == 0) revert InvalidWagerAmount();
        if (matches[matchId].status != MatchStatus.None) revert MatchAlreadyExists();

        matches[matchId] = Match({
            player1: msg.sender,
            player2: address(0),
            wagerAmount: wagerAmount,
            status: MatchStatus.Open,
            winner: address(0),
            createdAt: block.timestamp,
            expiresAt: block.timestamp + 30 minutes
        });

        usdc.safeTransferFrom(msg.sender, address(this), wagerAmount);

        emit MatchCreated(matchId, msg.sender, wagerAmount);
    }

    /**
     * @notice Player 2 joins an open match and deposits their wager.
     * @param matchId The match to join
     */
    function joinMatch(bytes32 matchId) external {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Open)
            revert InvalidMatchStatus(m.status, MatchStatus.Open);
        if (msg.sender == m.player1) revert CannotJoinOwnMatch();

        m.player2 = msg.sender;
        m.status = MatchStatus.Funded;

        usdc.safeTransferFrom(msg.sender, address(this), m.wagerAmount);

        emit MatchJoined(matchId, msg.sender);
    }

    /**
     * @notice Settle a match with the server's EIP-712 signature.
     *         Anyone can call this (server, winner, or any third party).
     *         Funds are transferred directly to players (auto-push).
     * @param matchId The match to settle
     * @param winner The winner's address (address(0) for draw)
     * @param signature EIP-712 signature from the settlement signer
     */
    function settleMatch(
        bytes32 matchId,
        address winner,
        bytes calldata signature
    ) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Funded)
            revert InvalidMatchStatus(m.status, MatchStatus.Funded);

        // Winner must be player1, player2, or address(0) for draw
        if (winner != address(0) && winner != m.player1 && winner != m.player2)
            revert InvalidWinner();

        // Verify EIP-712 signature
        bytes32 structHash = keccak256(abi.encode(SETTLEMENT_TYPEHASH, matchId, winner));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        if (signer != settlementSigner) revert InvalidSignature();

        m.status = MatchStatus.Settled;
        m.winner = winner;

        if (winner == address(0)) {
            // Draw — full refund, no fee (auto-push to both players)
            usdc.safeTransfer(m.player1, m.wagerAmount);
            usdc.safeTransfer(m.player2, m.wagerAmount);
            emit MatchDraw(matchId, m.wagerAmount, 0);
            emit MatchPayout(matchId, m.player1, m.wagerAmount);
            emit MatchPayout(matchId, m.player2, m.wagerAmount);
        } else {
            // Winner takes all minus fee (auto-push to winner)
            uint256 totalPot = m.wagerAmount * 2;
            uint256 fee = (totalPot * protocolFeeBps) / 10000;
            uint256 payout = totalPot - fee;
            usdc.safeTransfer(winner, payout);
            pendingWithdrawals[feeRecipient] += fee;
            totalFeesCollected += fee;
            emit MatchSettled(matchId, winner, payout, fee);
            emit MatchPayout(matchId, winner, payout);
        }
    }

    /**
     * @notice Player 1 cancels their open match and reclaims deposit immediately.
     *         Only callable by the match creator while match is still Open.
     * @param matchId The match to cancel
     */
    function cancelMatch(bytes32 matchId) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Open)
            revert InvalidMatchStatus(m.status, MatchStatus.Open);
        if (msg.sender != m.player1) revert NotMatchCreator();

        m.status = MatchStatus.Cancelled;
        usdc.safeTransfer(m.player1, m.wagerAmount);

        emit MatchCancelled(matchId, "creator_cancelled");
        emit MatchPayout(matchId, m.player1, m.wagerAmount);
    }

    /**
     * @notice Cancel an expired match (anyone can call after 30 min expiry).
     *         Player 1's deposit is auto-transferred back.
     * @param matchId The match to cancel
     */
    function cancelExpiredMatch(bytes32 matchId) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Open)
            revert InvalidMatchStatus(m.status, MatchStatus.Open);
        if (block.timestamp < m.expiresAt) revert MatchNotExpired();

        m.status = MatchStatus.Cancelled;
        usdc.safeTransfer(m.player1, m.wagerAmount);

        emit MatchCancelled(matchId, "expired");
        emit MatchPayout(matchId, m.player1, m.wagerAmount);
    }

    /**
     * @notice Claim a stale funded match — if match is funded but not settled
     *         after 48 hours, either player can reclaim their wager.
     *         Both players' deposits are auto-transferred back.
     * @param matchId The stale match
     */
    function claimStaleMatch(bytes32 matchId) external nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Funded)
            revert InvalidMatchStatus(m.status, MatchStatus.Funded);
        if (block.timestamp < m.createdAt + STALE_MATCH_TIMEOUT)
            revert MatchNotStale();

        m.status = MatchStatus.Cancelled;
        usdc.safeTransfer(m.player1, m.wagerAmount);
        usdc.safeTransfer(m.player2, m.wagerAmount);

        emit MatchCancelled(matchId, "stale");
        emit MatchPayout(matchId, m.player1, m.wagerAmount);
        emit MatchPayout(matchId, m.player2, m.wagerAmount);
    }

    /**
     * @notice Withdraw accumulated fees (pull pattern, primarily for feeRecipient).
     */
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawal(msg.sender, amount);
    }

    // ============================================================
    // Admin Functions
    // ============================================================

    /**
     * @notice Emergency settle — owner can force-settle a stuck funded match.
     *         Funds are auto-transferred to players.
     */
    function emergencySettle(bytes32 matchId, address winner) external onlyOwner nonReentrant {
        Match storage m = matches[matchId];
        if (m.status != MatchStatus.Funded)
            revert InvalidMatchStatus(m.status, MatchStatus.Funded);

        if (winner != address(0) && winner != m.player1 && winner != m.player2)
            revert InvalidWinner();

        m.status = MatchStatus.Settled;
        m.winner = winner;

        if (winner == address(0)) {
            // Draw — full refund, no fee
            usdc.safeTransfer(m.player1, m.wagerAmount);
            usdc.safeTransfer(m.player2, m.wagerAmount);
            emit MatchDraw(matchId, m.wagerAmount, 0);
            emit MatchPayout(matchId, m.player1, m.wagerAmount);
            emit MatchPayout(matchId, m.player2, m.wagerAmount);
        } else {
            uint256 totalPot = m.wagerAmount * 2;
            uint256 fee = (totalPot * protocolFeeBps) / 10000;
            uint256 payout = totalPot - fee;
            usdc.safeTransfer(winner, payout);
            pendingWithdrawals[feeRecipient] += fee;
            totalFeesCollected += fee;
            emit MatchSettled(matchId, winner, payout, fee);
            emit MatchPayout(matchId, winner, payout);
        }
    }

    function setSettlementSigner(address _signer) external onlyOwner {
        if (_signer == address(0)) revert ZeroAddress();
        settlementSigner = _signer;
    }

    function setProtocolFeeBps(uint256 _bps) external onlyOwner {
        if (_bps > MAX_FEE_BPS) revert InvalidFee();
        protocolFeeBps = _bps;
    }

    function setFeeRecipient(address _recipient) external onlyOwner {
        if (_recipient == address(0)) revert ZeroAddress();
        feeRecipient = _recipient;
    }

    // ============================================================
    // View Functions
    // ============================================================

    function getMatch(bytes32 matchId) external view returns (Match memory) {
        return matches[matchId];
    }

    /**
     * @notice Get the EIP-712 domain separator (useful for off-chain signing).
     */
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
