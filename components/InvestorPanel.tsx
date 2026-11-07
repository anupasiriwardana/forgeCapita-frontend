"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useConfig, usePublicClient, useReadContracts, useSignTypedData, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { formatUnits, parseUnits } from "viem";
import type { ProjectDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { getFeeOverrides } from "@/lib/fees";
import { chainCurrency } from "@/config/chains";
import { GaslessNotice, RelayStatus } from "@/components/RelayStatus";
import { useAuth } from "@/components/web3/AuthProvider";
import {
  describeRelayError,
  isTerminalStatus,
  newSignatureDeadline,
  relayClaim,
  relayStake,
  useRelayRequest,
  type RelayFailure,
} from "@/lib/relay";
import { phaseInputOf, refundsOpenFor } from "@/lib/projectState";

type Addr = `0x${string}`;
const ZERO = BigInt(0);

function asBig(v: unknown): bigint {
  return typeof v === "bigint" ? v : ZERO;
}

function fmt(v: bigint): string {
  const s = formatUnits(v, 18);
  const [i, f = ""] = s.split(".");
  const frac = f.slice(0, 6).replace(/0+$/, "");
  return frac ? `${i}.${frac}` : i;
}

function parseAmount(input: string): bigint | null {
  try {
    const v = parseUnits(input.trim(), 18);
    return v > ZERO ? v : null;
  } catch {
    return null;
  }
}

function errMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { shortMessage?: unknown; message?: unknown };
    if (typeof e.shortMessage === "string") return e.shortMessage;
    if (typeof e.message === "string") return e.message;
  }
  return "Transaction failed";
}

export function InvestorPanel({ project, nowSeconds }: { project: ProjectDto; nowSeconds: number }) {
  const { isConnected, address } = useAccount();
  const walletChainId = useChainId();
  const config = useConfig();
  const wrongChain = walletChainId !== project.chainId;
  const { writeContractAsync } = useWriteContract();
  const feeClient = usePublicClient({ chainId: project.chainId });
  const { user } = useAuth();
  const { signTypedDataAsync } = useSignTypedData();
  const relay = useRelayRequest();
  const [relayBusy, setRelayBusy] = useState(false);
  const [relayFailure, setRelayFailure] = useState<RelayFailure | null>(null);
  const [relayKind, setRelayKind] = useState<"stake" | "claim">("stake");

  const escrow = project.escrowAddress as Addr;
  const token = project.tokenAddress as Addr;
  const distributor = project.distributorAddress as Addr;
  const owner = address ?? ("0x0000000000000000000000000000000000000000" as Addr);

  const { data, refetch } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: escrow, abi: ABIS.escrow, functionName: "deposits", args: [owner], chainId: project.chainId },
      { address: token, abi: ABIS.token, functionName: "balanceOf", args: [owner], chainId: project.chainId },
      { address: distributor, abi: ABIS.distributor, functionName: "stakedBalance", args: [owner], chainId: project.chainId },
      { address: distributor, abi: ABIS.distributor, functionName: "getClaimableYield", args: [owner], chainId: project.chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "isUserVoteLocked", args: [owner], chainId: project.chainId },
      { address: token, abi: ABIS.token, functionName: "allowance", args: [owner, distributor], chainId: project.chainId },
      { address: token, abi: ABIS.token, functionName: "allowance", args: [owner, escrow], chainId: project.chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "hasClaimedTokens", args: [owner], chainId: project.chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "isFundingActive", chainId: project.chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "projectCancelled", chainId: project.chainId },
    ],
    query: { enabled: isConnected && !wrongChain },
  });

  const deposit = asBig(data?.[0]?.result);
  const balance = asBig(data?.[1]?.result);
  const staked = asBig(data?.[2]?.result);
  const claimable = asBig(data?.[3]?.result);
  const voteLocked = data?.[4]?.result === true;
  const distAllowance = asBig(data?.[5]?.result);
  const escrowAllowance = asBig(data?.[6]?.result);
  const tokensClaimed = data?.[7]?.result === true;
  const fundingClosedOnChain = data?.[8]?.result === false;
  const cancelledOnChain = data?.[9]?.result === true;

  const [stakeInput, setStakeInput] = useState("");
  const [unstakeInput, setUnstakeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const refundOpen = refundsOpenFor(BigInt(nowSeconds), phaseInputOf(project));
  const crowdfundFailed = project.fundingClosedAt == null;
  const needUnstake = !crowdfundFailed && balance === ZERO && staked > ZERO;
  const relayStatus = relay.status;
  const relayActive = relayBusy || (relayStatus !== null && !isTerminalStatus(relayStatus));
  const relayConfirmed = relayStatus === "CONFIRMED";
  const canClaimTokens = fundingClosedOnChain && !cancelledOnChain && deposit > ZERO && !tokensClaimed;
  const disabled = busy || relayActive || wrongChain || !isConnected;

  async function send(
    label: string,
    calls: { label: string; run: () => Promise<Addr> }[],
  ): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      for (const call of calls) {
        setStep(call.label);
        const hash = await call.run();
        const receipt = await waitForTransactionReceipt(config, { hash });
        if (receipt.status !== "success") {
          setResult({ ok: false, text: `${call.label} failed (reverted).` });
          return;
        }
      }
      setResult({ ok: true, text: `${label} confirmed.` });
    } catch (err) {
      setResult({ ok: false, text: errMessage(err) });
    } finally {
      setStep("");
      setBusy(false);
      await refetch();
    }
  }

  useEffect(() => {
    if (relayConfirmed) void refetch();
  }, [relayConfirmed, refetch]);

  async function runRelay(kind: "stake" | "claim", submit: () => Promise<{ id: string }>): Promise<void> {
    setRelayKind(kind);
    setRelayFailure(null);
    setResult(null);
    relay.reset();
    setRelayBusy(true);
    try {
      const intake = await submit();
      relay.track(intake.id);
    } catch (err) {
      setRelayFailure(describeRelayError(err));
    } finally {
      setRelayBusy(false);
    }
  }

  function handleGaslessStake(): void {
    const amount = parseAmount(stakeInput);
    if (amount === null || amount > balance) {
      setResult({ ok: false, text: "Enter a valid amount up to your token balance." });
      return;
    }
    if (!address || !user) return;
    void runRelay("stake", async () => {
      if (!feeClient) throw new Error("No RPC client for this chain");
      const [name, nonce] = await Promise.all([
        feeClient.readContract({ address: token, abi: ABIS.token, functionName: "name" }),
        feeClient.readContract({ address: token, abi: ABIS.token, functionName: "nonces", args: [address] }),
      ]);
      const deadline = newSignatureDeadline();
      const signature = await signTypedDataAsync({
        domain: { name, version: "1", chainId: project.chainId, verifyingContract: token },
        types: {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "Permit",
        message: { owner: address, spender: distributor, value: amount, nonce: BigInt(nonce), deadline: BigInt(deadline) },
      });
      const intake = await relayStake({ projectId: project.id, amount: amount.toString(), deadline, signature });
      setStakeInput("");
      return intake;
    });
  }

  function handleGaslessClaimTokens(): void {
    if (!user) return;
    void runRelay("claim", () => relayClaim(project.id));
  }

  function handleClaimTokens(): void {
    void send("Claim tokens", [
      {
        label: "Claim tokens",
        run: async () => writeContractAsync({ address: escrow, abi: ABIS.escrow, functionName: "claimTokens", ...(await getFeeOverrides(feeClient)) }),
      },
    ]);
  }

  const approve = (spender: Addr, amount: bigint) => async () =>
    writeContractAsync({ address: token, abi: ABIS.token, functionName: "approve", args: [spender, amount], ...(await getFeeOverrides(feeClient)) });

  function handleStake(): void {
    const amount = parseAmount(stakeInput);
    if (amount === null || amount > balance) {
      setResult({ ok: false, text: "Enter a valid amount up to your token balance." });
      return;
    }
    const calls = [];
    if (distAllowance < amount) calls.push({ label: "Step 1: approve tokens", run: approve(distributor, amount) });
    calls.push({
      label: calls.length ? "Step 2: stake" : "Stake",
      run: async () => writeContractAsync({ address: distributor, abi: ABIS.distributor, functionName: "stake", args: [amount], ...(await getFeeOverrides(feeClient)) }),
    });
    void send("Stake", calls).then(() => setStakeInput(""));
  }

  function handleUnstake(): void {
    const amount = parseAmount(unstakeInput);
    if (amount === null || amount > staked) {
      setResult({ ok: false, text: "Enter a valid amount up to your staked balance." });
      return;
    }
    void send("Unstake", [
      {
        label: "Unstake",
        run: async () => writeContractAsync({ address: distributor, abi: ABIS.distributor, functionName: "withdraw", args: [amount], ...(await getFeeOverrides(feeClient)) }),
      },
    ]).then(() => setUnstakeInput(""));
  }

  function handleClaim(): void {
    void send("Claim yield", [
      {
        label: "Claim yield",
        run: async () => writeContractAsync({ address: distributor, abi: ABIS.distributor, functionName: "claimYield", ...(await getFeeOverrides(feeClient)) }),
      },
    ]);
  }

  function handleRefund(): void {
    if (crowdfundFailed) {
      void send("Refund", [
        {
          label: "Refund",
          run: async () => writeContractAsync({ address: escrow, abi: ABIS.escrow, functionName: "refundFailedCrowdfund", ...(await getFeeOverrides(feeClient)) }),
        },
      ]);
      return;
    }
    const calls = [];
    if (escrowAllowance < balance) calls.push({ label: "Step 1: approve tokens", run: approve(escrow, balance) });
    calls.push({
      label: calls.length ? "Step 2: refund" : "Refund",
      run: async () => writeContractAsync({ address: escrow, abi: ABIS.escrow, functionName: "refundDeadProject", ...(await getFeeOverrides(feeClient)) }),
    });
    void send("Refund", calls);
  }

  const row = { display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: "13px" } as const;
  const muted = { color: "var(--text-muted)" } as const;
  const section = { marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" } as const;

  return (
    <div className="glass-card" style={{ padding: "28px", marginTop: "24px" }}>
      <h2 style={{ fontSize: "20px", marginBottom: "4px" }}>👛 Your Position</h2>
      <p style={{ fontSize: "12px", ...muted, marginTop: 0 }}>Staking and claiming tokens can be gasless; the other actions need your own gas.</p>

      {!isConnected ? (
        <div className="alert alert-warning">
          <span>🔌</span>
          <span>Connect your wallet to see your position.</span>
        </div>
      ) : (
        <>
          {wrongChain && (
            <div className="alert alert-warning" style={{ marginBottom: "16px" }}>
              <span>⚠️</span>
              <span>Switch your wallet to this project&apos;s network (chain {project.chainId}) to use these actions.</span>
            </div>
          )}

          <div>
            <div style={row}><span style={muted}>Deposited</span><span>{fmt(deposit)} {chainCurrency(project.chainId)}</span></div>
            <div style={row}><span style={muted}>Token balance</span><span>{fmt(balance)}</span></div>
            <div style={row}><span style={muted}>Staked</span><span>{fmt(staked)}</span></div>
            <div style={row}><span style={muted}>Claimable yield</span><span>{fmt(claimable)} {chainCurrency(project.chainId)}</span></div>
          </div>

          <div style={section}>
            <label className="label">Stake</label>
            <GaslessNotice />
            <div style={{ display: "flex", gap: "8px" }}>
              <input className="input-field" value={stakeInput} onChange={e => setStakeInput(e.target.value)} placeholder="0.0" disabled={disabled} />
              <button type="button" className="btn-secondary" disabled={disabled} onClick={() => setStakeInput(formatUnits(balance, 18))}>Max</button>
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button type="button" className="btn-primary" style={{ flex: 1 }} disabled={disabled || !user || !stakeInput} onClick={handleGaslessStake}>
                Stake (gasless)
              </button>
              <button type="button" className="btn-secondary" style={{ flex: 1 }} disabled={disabled || !stakeInput} onClick={handleStake}>
                Stake (pay gas)
              </button>
            </div>
            {relayKind === "stake" && (
              <RelayStatus chainId={project.chainId} status={relayStatus} request={relay.request} pollError={relay.pollError} failure={relayFailure} onSelfPay={handleStake} />
            )}
          </div>

          {canClaimTokens && (
            <div style={section}>
              <label className="label">Claim my tokens</label>
              <GaslessNotice />
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" className="btn-primary" style={{ flex: 1 }} disabled={disabled || !user} onClick={handleGaslessClaimTokens}>
                  Claim tokens (gasless)
                </button>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} disabled={disabled} onClick={handleClaimTokens}>
                  Claim tokens (pay gas)
                </button>
              </div>
              {relayKind === "claim" && (
                <RelayStatus chainId={project.chainId} status={relayStatus} request={relay.request} pollError={relay.pollError} failure={relayFailure} onSelfPay={handleClaimTokens} />
              )}
            </div>
          )}

          <div style={section}>
            <label className="label">Unstake (you pay gas)</label>
            {voteLocked && (
              <div className="alert alert-warning" style={{ marginBottom: "8px" }}>
                <span>🔒</span>
                <span>Vote-locked: you voted on an active milestone. Unstaking opens when the poll closes.</span>
              </div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <input className="input-field" value={unstakeInput} onChange={e => setUnstakeInput(e.target.value)} placeholder="0.0" disabled={disabled || voteLocked} />
              <button type="button" className="btn-secondary" disabled={disabled || voteLocked} onClick={() => setUnstakeInput(formatUnits(staked, 18))}>Max</button>
              <button type="button" className="btn-primary" disabled={disabled || voteLocked || !unstakeInput} onClick={handleUnstake}>Unstake</button>
            </div>
          </div>

          <div style={section}>
            <button type="button" className="btn-primary" style={{ width: "100%" }} disabled={disabled || claimable === ZERO} onClick={handleClaim}>
              Claim yield (you pay gas)
            </button>
          </div>

          {refundOpen && (
            <div style={section}>
              <button
                type="button"
                className="btn-secondary"
                style={{ width: "100%" }}
                disabled={disabled || (crowdfundFailed ? deposit === ZERO : needUnstake)}
                onClick={handleRefund}
              >
                Refund (you pay gas)
              </button>
              {needUnstake && <p style={{ fontSize: "12px", ...muted }}>Unstake first: staked tokens must be returned to your wallet.</p>}
            </div>
          )}

          {busy && step && (
            <div className="alert alert-warning" style={{ marginTop: "16px" }}>
              <span className="spinner" style={{ width: "14px", height: "14px" }} />
              <span>{step}: confirm in your wallet and wait for confirmation...</span>
            </div>
          )}
          {result && (
            <div className={`alert ${result.ok ? "alert-success" : "alert-error"}`} style={{ marginTop: "16px" }}>
              <span>{result.ok ? "✅" : "⚠️"}</span>
              <span>{result.text}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
