import { expect } from "chai";
import hre from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers.js";

describe("WagerWars", function () {
  async function deployFixture() {
    const [owner, player1, player2, signer, feeRecipient, other] =
      await hre.ethers.getSigners();

    // Deploy mock USDC (6 decimals)
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    // Deploy WagerWars
    const WagerWars = await hre.ethers.getContractFactory("WagerWars");
    const wagerWars = await WagerWars.deploy(
      await usdc.getAddress(),
      signer.address,
      300, // 3% fee
      feeRecipient.address,
    );

    // Mint USDC to players
    const wagerAmount = 10_000_000n; // 10 USDC (6 decimals)
    await usdc.mint(player1.address, wagerAmount * 10n);
    await usdc.mint(player2.address, wagerAmount * 10n);

    // Approve WagerWars
    const wagerWarsAddr = await wagerWars.getAddress();
    await usdc.connect(player1).approve(wagerWarsAddr, wagerAmount * 10n);
    await usdc.connect(player2).approve(wagerWarsAddr, wagerAmount * 10n);

    const matchId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("match-1"));

    return { wagerWars, usdc, owner, player1, player2, signer, feeRecipient, other, wagerAmount, matchId };
  }

  async function signSettlement(
    wagerWars: Awaited<ReturnType<typeof deployFixture>>["wagerWars"],
    signer: Awaited<ReturnType<typeof deployFixture>>["signer"],
    matchId: string,
    winner: string,
  ) {
    const domain = {
      name: "WagerWars",
      version: "1",
      chainId: (await hre.ethers.provider.getNetwork()).chainId,
      verifyingContract: await wagerWars.getAddress(),
    };
    const types = {
      Settlement: [
        { name: "matchId", type: "bytes32" },
        { name: "winner", type: "address" },
      ],
    };
    const value = { matchId, winner };
    return signer.signTypedData(domain, types, value);
  }

  // ---- Match Creation ----

  describe("createMatch", function () {
    it("creates a match and transfers USDC", async function () {
      const { wagerWars, usdc, player1, wagerAmount, matchId } = await loadFixture(deployFixture);

      await expect(wagerWars.connect(player1).createMatch(matchId, wagerAmount))
        .to.emit(wagerWars, "MatchCreated")
        .withArgs(matchId, player1.address, wagerAmount);

      const match = await wagerWars.getMatch(matchId);
      expect(match.player1).to.equal(player1.address);
      expect(match.status).to.equal(1n); // Open
      expect(match.wagerAmount).to.equal(wagerAmount);

      // USDC transferred
      expect(await usdc.balanceOf(await wagerWars.getAddress())).to.equal(wagerAmount);
    });

    it("reverts on duplicate matchId", async function () {
      const { wagerWars, player1, wagerAmount, matchId } = await loadFixture(deployFixture);
      await wagerWars.connect(player1).createMatch(matchId, wagerAmount);
      await expect(wagerWars.connect(player1).createMatch(matchId, wagerAmount))
        .to.be.revertedWithCustomError(wagerWars, "MatchAlreadyExists");
    });

    it("reverts on zero wager", async function () {
      const { wagerWars, player1, matchId } = await loadFixture(deployFixture);
      await expect(wagerWars.connect(player1).createMatch(matchId, 0n))
        .to.be.revertedWithCustomError(wagerWars, "InvalidWagerAmount");
    });
  });

  // ---- Match Joining ----

  describe("joinMatch", function () {
    it("player2 joins and match becomes Funded", async function () {
      const { wagerWars, usdc, player1, player2, wagerAmount, matchId } = await loadFixture(deployFixture);
      await wagerWars.connect(player1).createMatch(matchId, wagerAmount);

      await expect(wagerWars.connect(player2).joinMatch(matchId))
        .to.emit(wagerWars, "MatchJoined")
        .withArgs(matchId, player2.address);

      const match = await wagerWars.getMatch(matchId);
      expect(match.player2).to.equal(player2.address);
      expect(match.status).to.equal(2n); // Funded

      expect(await usdc.balanceOf(await wagerWars.getAddress())).to.equal(wagerAmount * 2n);
    });

    it("reverts if player1 tries to join own match", async function () {
      const { wagerWars, player1, wagerAmount, matchId } = await loadFixture(deployFixture);
      await wagerWars.connect(player1).createMatch(matchId, wagerAmount);
      await expect(wagerWars.connect(player1).joinMatch(matchId))
        .to.be.revertedWithCustomError(wagerWars, "CannotJoinOwnMatch");
    });

    it("reverts if match is not Open", async function () {
      const { wagerWars, player2, matchId } = await loadFixture(deployFixture);
      await expect(wagerWars.connect(player2).joinMatch(matchId))
        .to.be.revertedWithCustomError(wagerWars, "InvalidMatchStatus");
    });
  });

  // ---- Settlement ----

  describe("settleMatch", function () {
    async function fundedMatchFixture() {
      const f = await loadFixture(deployFixture);
      await f.wagerWars.connect(f.player1).createMatch(f.matchId, f.wagerAmount);
      await f.wagerWars.connect(f.player2).joinMatch(f.matchId);
      return f;
    }

    it("settles with player1 as winner — auto-pushes USDC to winner", async function () {
      const { wagerWars, usdc, player1, player2, signer, feeRecipient, wagerAmount, matchId } =
        await fundedMatchFixture();

      const sig = await signSettlement(wagerWars, signer, matchId, player1.address);

      const balBefore = await usdc.balanceOf(player1.address);

      await expect(wagerWars.settleMatch(matchId, player1.address, sig))
        .to.emit(wagerWars, "MatchSettled")
        .to.emit(wagerWars, "MatchPayout");

      const match = await wagerWars.getMatch(matchId);
      expect(match.status).to.equal(3n); // Settled
      expect(match.winner).to.equal(player1.address);

      // Winner gets USDC directly (not in pendingWithdrawals)
      const totalPot = wagerAmount * 2n;
      const fee = (totalPot * 300n) / 10000n; // 0.6 USDC
      const payout = totalPot - fee;

      const balAfter = await usdc.balanceOf(player1.address);
      expect(balAfter - balBefore).to.equal(payout);

      // Winner's pendingWithdrawals should be 0 (funds sent directly)
      expect(await wagerWars.pendingWithdrawals(player1.address)).to.equal(0n);
      // Fee goes to feeRecipient's pendingWithdrawals
      expect(await wagerWars.pendingWithdrawals(feeRecipient.address)).to.equal(fee);
      // Loser gets nothing
      expect(await wagerWars.pendingWithdrawals(player2.address)).to.equal(0n);
    });

    it("settles as draw — auto-pushes refund to both players, no fee", async function () {
      const { wagerWars, usdc, player1, player2, signer, feeRecipient, wagerAmount, matchId } =
        await fundedMatchFixture();

      const sig = await signSettlement(wagerWars, signer, matchId, hre.ethers.ZeroAddress);

      const bal1Before = await usdc.balanceOf(player1.address);
      const bal2Before = await usdc.balanceOf(player2.address);

      await expect(wagerWars.settleMatch(matchId, hre.ethers.ZeroAddress, sig))
        .to.emit(wagerWars, "MatchDraw")
        .to.emit(wagerWars, "MatchPayout");

      // Both players get full wager back (no fee on draws)
      const bal1After = await usdc.balanceOf(player1.address);
      const bal2After = await usdc.balanceOf(player2.address);
      expect(bal1After - bal1Before).to.equal(wagerAmount);
      expect(bal2After - bal2Before).to.equal(wagerAmount);

      // No pendingWithdrawals for players
      expect(await wagerWars.pendingWithdrawals(player1.address)).to.equal(0n);
      expect(await wagerWars.pendingWithdrawals(player2.address)).to.equal(0n);
      // No fee on draws
      expect(await wagerWars.pendingWithdrawals(feeRecipient.address)).to.equal(0n);
    });

    it("reverts with invalid signature", async function () {
      const { wagerWars, player1, other, matchId } = await fundedMatchFixture();

      // Sign with wrong signer
      const domain = {
        name: "WagerWars",
        version: "1",
        chainId: (await hre.ethers.provider.getNetwork()).chainId,
        verifyingContract: await wagerWars.getAddress(),
      };
      const types = {
        Settlement: [
          { name: "matchId", type: "bytes32" },
          { name: "winner", type: "address" },
        ],
      };
      const sig = await other.signTypedData(domain, types, { matchId, winner: player1.address });

      await expect(wagerWars.settleMatch(matchId, player1.address, sig))
        .to.be.revertedWithCustomError(wagerWars, "InvalidSignature");
    });

    it("reverts with invalid winner address", async function () {
      const { wagerWars, signer, other, matchId } = await fundedMatchFixture();
      const sig = await signSettlement(wagerWars, signer, matchId, other.address);
      await expect(wagerWars.settleMatch(matchId, other.address, sig))
        .to.be.revertedWithCustomError(wagerWars, "InvalidWinner");
    });

    it("reverts if match already settled", async function () {
      const { wagerWars, player1, signer, matchId } = await fundedMatchFixture();
      const sig = await signSettlement(wagerWars, signer, matchId, player1.address);
      await wagerWars.settleMatch(matchId, player1.address, sig);
      await expect(wagerWars.settleMatch(matchId, player1.address, sig))
        .to.be.revertedWithCustomError(wagerWars, "InvalidMatchStatus");
    });

    it("anyone can submit settlement (not just players)", async function () {
      const { wagerWars, player1, signer, other, matchId } = await fundedMatchFixture();
      const sig = await signSettlement(wagerWars, signer, matchId, player1.address);
      // Submit from a random address — should work
      await expect(wagerWars.connect(other).settleMatch(matchId, player1.address, sig))
        .to.emit(wagerWars, "MatchSettled");
    });
  });

  // ---- Withdrawal (for feeRecipient) ----

  describe("withdraw", function () {
    it("feeRecipient can withdraw accumulated fees", async function () {
      const { wagerWars, usdc, player1, player2, signer, feeRecipient, wagerAmount, matchId } =
        await loadFixture(deployFixture);

      await wagerWars.connect(player1).createMatch(matchId, wagerAmount);
      await wagerWars.connect(player2).joinMatch(matchId);

      const sig = await signSettlement(wagerWars, signer, matchId, player1.address);
      await wagerWars.settleMatch(matchId, player1.address, sig);

      const totalPot = wagerAmount * 2n;
      const fee = (totalPot * 300n) / 10000n;

      const balBefore = await usdc.balanceOf(feeRecipient.address);
      await wagerWars.connect(feeRecipient).withdraw();
      const balAfter = await usdc.balanceOf(feeRecipient.address);

      expect(balAfter - balBefore).to.equal(fee);
      expect(await wagerWars.pendingWithdrawals(feeRecipient.address)).to.equal(0n);
    });

    it("reverts if nothing to withdraw", async function () {
      const { wagerWars, other } = await loadFixture(deployFixture);
      await expect(wagerWars.connect(other).withdraw())
        .to.be.revertedWithCustomError(wagerWars, "NothingToWithdraw");
    });
  });

  // ---- Cancel Match (immediate by creator) ----

  describe("cancelMatch", function () {
    it("creator can cancel open match and reclaim deposit immediately", async function () {
      const { wagerWars, usdc, player1, wagerAmount, matchId } = await loadFixture(deployFixture);
      await wagerWars.connect(player1).createMatch(matchId, wagerAmount);

      const balBefore = await usdc.balanceOf(player1.address);

      await expect(wagerWars.connect(player1).cancelMatch(matchId))
        .to.emit(wagerWars, "MatchCancelled")
        .to.emit(wagerWars, "MatchPayout");

      const balAfter = await usdc.balanceOf(player1.address);
      expect(balAfter - balBefore).to.equal(wagerAmount);

      const match = await wagerWars.getMatch(matchId);
      expect(match.status).to.equal(4n); // Cancelled
    });

    it("reverts if not the creator", async function () {
      const { wagerWars, player1, player2, wagerAmount, matchId } = await loadFixture(deployFixture);
      await wagerWars.connect(player1).createMatch(matchId, wagerAmount);
      await expect(wagerWars.connect(player2).cancelMatch(matchId))
        .to.be.revertedWithCustomError(wagerWars, "NotMatchCreator");
    });

    it("reverts if match is not Open", async function () {
      const { wagerWars, player1, player2, wagerAmount, matchId } = await loadFixture(deployFixture);
      await wagerWars.connect(player1).createMatch(matchId, wagerAmount);
      await wagerWars.connect(player2).joinMatch(matchId);

      // Match is now Funded, not Open
      await expect(wagerWars.connect(player1).cancelMatch(matchId))
        .to.be.revertedWithCustomError(wagerWars, "InvalidMatchStatus");
    });
  });

  // ---- Cancel Expired / Stale ----

  describe("cancelExpiredMatch", function () {
    it("player1 reclaims after expiry — USDC sent directly", async function () {
      const { wagerWars, usdc, player1, wagerAmount, matchId } = await loadFixture(deployFixture);
      await wagerWars.connect(player1).createMatch(matchId, wagerAmount);

      // Fast-forward 31 minutes
      await time.increase(31 * 60);

      const balBefore = await usdc.balanceOf(player1.address);

      await expect(wagerWars.cancelExpiredMatch(matchId))
        .to.emit(wagerWars, "MatchCancelled")
        .to.emit(wagerWars, "MatchPayout");

      const balAfter = await usdc.balanceOf(player1.address);
      expect(balAfter - balBefore).to.equal(wagerAmount);
      // Not in pendingWithdrawals
      expect(await wagerWars.pendingWithdrawals(player1.address)).to.equal(0n);
    });

    it("reverts if not expired yet", async function () {
      const { wagerWars, player1, wagerAmount, matchId } = await loadFixture(deployFixture);
      await wagerWars.connect(player1).createMatch(matchId, wagerAmount);
      await expect(wagerWars.cancelExpiredMatch(matchId))
        .to.be.revertedWithCustomError(wagerWars, "MatchNotExpired");
    });
  });

  describe("claimStaleMatch", function () {
    it("both players reclaim after 48h stale — USDC sent directly", async function () {
      const { wagerWars, usdc, player1, player2, wagerAmount, matchId } = await loadFixture(deployFixture);
      await wagerWars.connect(player1).createMatch(matchId, wagerAmount);
      await wagerWars.connect(player2).joinMatch(matchId);

      // Fast-forward 49 hours
      await time.increase(49 * 60 * 60);

      const bal1Before = await usdc.balanceOf(player1.address);
      const bal2Before = await usdc.balanceOf(player2.address);

      await expect(wagerWars.claimStaleMatch(matchId))
        .to.emit(wagerWars, "MatchCancelled")
        .to.emit(wagerWars, "MatchPayout");

      const bal1After = await usdc.balanceOf(player1.address);
      const bal2After = await usdc.balanceOf(player2.address);
      expect(bal1After - bal1Before).to.equal(wagerAmount);
      expect(bal2After - bal2Before).to.equal(wagerAmount);
      // Not in pendingWithdrawals
      expect(await wagerWars.pendingWithdrawals(player1.address)).to.equal(0n);
      expect(await wagerWars.pendingWithdrawals(player2.address)).to.equal(0n);
    });

    it("reverts if not stale yet", async function () {
      const { wagerWars, player1, player2, wagerAmount, matchId } = await loadFixture(deployFixture);
      await wagerWars.connect(player1).createMatch(matchId, wagerAmount);
      await wagerWars.connect(player2).joinMatch(matchId);
      await expect(wagerWars.claimStaleMatch(matchId))
        .to.be.revertedWithCustomError(wagerWars, "MatchNotStale");
    });
  });

  // ---- Admin ----

  describe("Admin functions", function () {
    it("emergencySettle works for owner — auto-pushes USDC", async function () {
      const { wagerWars, usdc, owner, player1, player2, wagerAmount, matchId } = await loadFixture(deployFixture);
      await wagerWars.connect(player1).createMatch(matchId, wagerAmount);
      await wagerWars.connect(player2).joinMatch(matchId);

      const balBefore = await usdc.balanceOf(player1.address);
      await wagerWars.connect(owner).emergencySettle(matchId, player1.address);

      const match = await wagerWars.getMatch(matchId);
      expect(match.status).to.equal(3n); // Settled

      // Winner gets USDC directly
      const totalPot = wagerAmount * 2n;
      const fee = (totalPot * 300n) / 10000n;
      const payout = totalPot - fee;
      const balAfter = await usdc.balanceOf(player1.address);
      expect(balAfter - balBefore).to.equal(payout);
    });

    it("emergencySettle reverts for non-owner", async function () {
      const { wagerWars, player1, player2, other, wagerAmount, matchId } = await loadFixture(deployFixture);
      await wagerWars.connect(player1).createMatch(matchId, wagerAmount);
      await wagerWars.connect(player2).joinMatch(matchId);

      await expect(wagerWars.connect(other).emergencySettle(matchId, player1.address))
        .to.be.revertedWithCustomError(wagerWars, "OwnableUnauthorizedAccount");
    });

    it("setProtocolFeeBps respects max cap", async function () {
      const { wagerWars, owner } = await loadFixture(deployFixture);
      await expect(wagerWars.connect(owner).setProtocolFeeBps(1001n))
        .to.be.revertedWithCustomError(wagerWars, "InvalidFee");
      await wagerWars.connect(owner).setProtocolFeeBps(500n);
      expect(await wagerWars.protocolFeeBps()).to.equal(500n);
    });
  });
});
