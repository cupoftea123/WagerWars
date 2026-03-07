"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract } from "wagmi";
import { parseUnits } from "viem";
import { WAGER_WARS_ADDRESS, WAGER_WARS_ABI, USDC_ADDRESS, ERC20_ABI } from "@/lib/contracts";

export type DepositStep = "idle" | "approving" | "waiting_approve" | "depositing" | "waiting_deposit" | "done" | "error";

interface UseDepositReturn {
  step: DepositStep;
  error: string | null;
  approveTxHash: `0x${string}` | undefined;
  depositTxHash: `0x${string}` | undefined;
  createMatchOnChain: (onChainMatchId: `0x${string}`, wagerAmount: number) => void;
  joinMatchOnChain: (onChainMatchId: `0x${string}`, wagerAmount: number) => void;
  reset: () => void;
}

type PendingDeposit =
  | { type: "create"; onChainMatchId: `0x${string}`; amountWei: bigint }
  | { type: "join"; onChainMatchId: `0x${string}` };

export function useDeposit(): UseDepositReturn {
  const { address } = useAccount();
  const [step, setStep] = useState<DepositStep>("idle");
  const [error, setError] = useState<string | null>(null);

  // Store pending deposit params so the approve-confirmed effect can use them
  const pendingDepositRef = useRef<PendingDeposit | null>(null);

  // Check current USDC allowance for WagerWars contract
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, WAGER_WARS_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  const {
    writeContract: writeApprove,
    data: approveTxHash,
    reset: resetApprove,
  } = useWriteContract();

  const {
    writeContract: writeDeposit,
    data: depositTxHash,
    reset: resetDeposit,
  } = useWriteContract();

  // Wait for approve tx to be confirmed ON-CHAIN
  const { isSuccess: approveConfirmed, isError: approveReverted } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  // Wait for deposit tx
  const { isSuccess: depositConfirmed, isError: depositReverted, error: depositError } = useWaitForTransactionReceipt({
    hash: depositTxHash,
  });

  // Submit the deposit tx (createMatch or joinMatch) — shared by both paths
  const submitDeposit = useCallback(() => {
    const pending = pendingDepositRef.current;
    if (!pending) return;

    setStep("depositing");

    if (pending.type === "create") {
      writeDeposit(
        {
          address: WAGER_WARS_ADDRESS,
          abi: WAGER_WARS_ABI,
          functionName: "createMatch",
          args: [pending.onChainMatchId, pending.amountWei],
        },
        {
          onSuccess: () => setStep("waiting_deposit"),
          onError: (err) => {
            setError(err.message.slice(0, 300));
            setStep("error");
          },
        },
      );
    } else {
      writeDeposit(
        {
          address: WAGER_WARS_ADDRESS,
          abi: WAGER_WARS_ABI,
          functionName: "joinMatch",
          args: [pending.onChainMatchId],
        },
        {
          onSuccess: () => setStep("waiting_deposit"),
          onError: (err) => {
            setError(err.message.slice(0, 300));
            setStep("error");
          },
        },
      );
    }
  }, [writeDeposit]);

  // When approve is confirmed on-chain, submit the deposit tx
  useEffect(() => {
    if (!approveConfirmed || step !== "waiting_approve") return;
    if (!pendingDepositRef.current) return;
    submitDeposit();
  }, [approveConfirmed, step, submitDeposit]);

  // Approve reverted on-chain
  useEffect(() => {
    if (approveReverted && step === "waiting_approve") {
      setError("Approve transaction reverted on-chain");
      setStep("error");
    }
  }, [approveReverted, step]);

  // Deposit confirmed on-chain
  useEffect(() => {
    if (depositConfirmed && step === "waiting_deposit") {
      setStep("done");
      // Refetch allowance after deposit (allowance decreases by wager amount)
      refetchAllowance();
    }
  }, [depositConfirmed, step, refetchAllowance]);

  // Deposit reverted on-chain
  useEffect(() => {
    if (depositReverted && step === "waiting_deposit") {
      const reason = depositError?.message?.slice(0, 300) || "Unknown reason";
      const txLink = depositTxHash ? `\nTx: https://testnet.snowtrace.io/tx/${depositTxHash}` : "";
      setError(`Reverted: ${reason}${txLink}`);
      setStep("error");
    }
  }, [depositReverted, step, depositError, depositTxHash]);

  // Start deposit flow: check allowance → skip approve if sufficient, otherwise approve first
  const startDeposit = useCallback(
    (pending: PendingDeposit, amountWei: bigint) => {
      if (!address) return;
      setError(null);
      pendingDepositRef.current = pending;

      // If allowance already covers the wager, skip approve entirely
      if (currentAllowance !== undefined && (currentAllowance as bigint) >= amountWei) {
        submitDeposit();
        return;
      }

      // Need approve first
      setStep("approving");
      writeApprove(
        {
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [WAGER_WARS_ADDRESS, amountWei],
        },
        {
          onSuccess: () => setStep("waiting_approve"),
          onError: (err) => {
            setError(err.message.slice(0, 300));
            setStep("error");
          },
        },
      );
    },
    [address, currentAllowance, writeApprove, submitDeposit],
  );

  const doCreate = useCallback(
    (onChainMatchId: `0x${string}`, wagerAmount: number) => {
      const amountWei = parseUnits(wagerAmount.toString(), 6);
      startDeposit({ type: "create", onChainMatchId, amountWei }, amountWei);
    },
    [startDeposit],
  );

  const doJoin = useCallback(
    (onChainMatchId: `0x${string}`, wagerAmount: number) => {
      const amountWei = parseUnits(wagerAmount.toString(), 6);
      startDeposit({ type: "join", onChainMatchId }, amountWei);
    },
    [startDeposit],
  );

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    pendingDepositRef.current = null;
    resetApprove();
    resetDeposit();
  }, [resetApprove, resetDeposit]);

  return {
    step,
    error,
    approveTxHash,
    depositTxHash,
    createMatchOnChain: doCreate,
    joinMatchOnChain: doJoin,
    reset,
  };
}
