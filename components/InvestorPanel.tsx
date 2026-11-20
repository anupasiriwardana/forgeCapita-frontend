"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useConfig, usePublicClient, useReadContracts, useSignTypedData, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Lock, Wallet } from "lucide-react";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/lib/toast";
import { isUserRejection, toastTxError, WALLET_CANCELLED_MESSAGE } from "@/lib/walletErrors";
import { formatUnits, parseUnits } from "viem";
import type { ProjectDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { getFeeOverrides } from "@/lib/fees";
import { chainCurrency, chainName } from "@/config/chains";
import { GaslessNotice, RelayStatus } from "@/components/RelayStatus";
import { useAuth } from "@/components/web3/AuthProvider";
import { useWriteAllowed } from "@/components/web3/useWriteAllowed";
import { ProfileRequiredNotice } from "@/components/ProfileRequiredNotice";
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

/** Live field error: null when empty or within `max`. */
function amountError(input: string, max: bigint, what: string): string | null {
  if (input.trim() === "") return null;
  const amount = parseAmount(input);
  if (amount === null) return "Enter a valid amount greater than 0.";
  return amount > max ? `Amount is above your ${what}.` : null;
}

function parseAmount(input: string): bigint | null {
  try {
    const v = parseUnits(input.trim(), 18);
    return v > ZERO ? v : null;
  } catch {
    return null;
  }
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
  const [activeLabel, setActiveLabel] = useState("");

  const refundOpen = refundsOpenFor(BigInt(nowSeconds), phaseInputOf(project));
  const crowdfundFailed = project.fundingClosedAt == null;
  const needUnstake = !crowdfundFailed && balance === ZERO && staked > ZERO;
  const relayStatus = relay.status;
  const relayActive = relayBusy || (relayStatus !== null && !isTerminalStatus(relayStatus));
  const relayConfirmed = relayStatus === "CONFIRMED";
  const canClaimTokens = fundingClosedOnChain && !cancelledOnChain && deposit > ZERO && !tokensClaimed;
  const { allowed: writeAllowed } = useWriteAllowed();
  const disabled = busy || relayActive || wrongChain || !isConnected || !writeAllowed;

  async function send(
    label: string,
    calls: { label: string; run: () => Promise<Addr> }[],
  ): Promise<void> {
    setBusy(true);
    setActiveLabel(label);
    try {
      for (const call of calls) {
        setStep(call.label);
        const hash = await call.run();
        const receipt = await waitForTransactionReceipt(config, { hash });
        if (receipt.status !== "success") {
          toast.error(`${call.label} failed (reverted).`);
          return;
        }
      }
      toast.success(`${label} confirmed.`);
    } catch (err) {
      toastTxError(err);
    } finally {
      setStep("");
      setActiveLabel("");
      setBusy(false);
      await refetch();
    }
  }

  useEffect(() => {
    if (relayConfirmed) void refetch();
  }, [relayConfirmed, refetch]);

  useEffect(() => {
    if (relayConfirmed) toast.success(relayKind === "stake" ? "Gasless stake confirmed." : "Gasless token claim confirmed.");
  }, [relayConfirmed, relayKind]);

  async function runRelay(kind: "stake" | "claim", submit: () => Promise<{ id: string }>): Promise<void> {
    setRelayKind(kind);
    setRelayFailure(null);
    relay.reset();
    setRelayBusy(true);
    try {
      const intake = await submit();
      relay.track(intake.id);
    } catch (err) {
      if (isUserRejection(err)) toast.info(WALLET_CANCELLED_MESSAGE);
      else setRelayFailure(describeRelayError(err));
    } finally {
      setRelayBusy(false);
    }
  }

  function handleGaslessStake(): void {
    const amount = parseAmount(stakeInput);
    if (amount === null || amount > balance) {
      toast.error("Enter a valid amount up to your token balance.");
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
      toast.error("Enter a valid amount up to your token balance.");
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
      toast.error("Enter a valid amount up to your staked balance.");
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

  const currency = chainCurrency(project.chainId);
  const stakeError = amountError(stakeInput, balance, "token balance");
  const unstakeError = amountError(unstakeInput, staked, "staked balance");
  const isActive = (label: string): boolean => busy && activeLabel === label;

  return (
    <Card>
      <CardHeader
        title={
          <span className="panel-title">
            <Wallet size={16} aria-hidden="true" />
            Your position
          </span>
        }
        subtitle="Staking and claiming tokens can be gasless; the other actions need your own gas."
      />
      <CardBody>
        {!isConnected ? (
          <InlineAlert tone="warning">Connect your wallet to see your position.</InlineAlert>
        ) : (
          <>
            {wrongChain && (
              <InlineAlert tone="warning" className="panel-gap">
                Switch your wallet to this project&apos;s network ({chainName(project.chainId)}) to use these actions.
              </InlineAlert>
            )}

            <ProfileRequiredNotice className="panel-gap" />

            <div className="kv-list">
              <div className="kv-row"><span>Deposited</span><Amount value={deposit} unit={currency} maxFractionDigits={6} /></div>
              <div className="kv-row"><span>Token balance</span><Amount value={balance} unit={project.tokenSymbol || undefined} maxFractionDigits={6} /></div>
              <div className="kv-row"><span>Staked</span><Amount value={staked} unit={project.tokenSymbol || undefined} maxFractionDigits={6} /></div>
              <div className="kv-row"><span>Claimable yield</span><Amount value={claimable} unit={currency} maxFractionDigits={6} /></div>
            </div>

            <div className="panel-section">
              <Field label="Stake" error={stakeError ?? undefined}>
                <div className="input-row">
                  <Input value={stakeInput} onChange={e => setStakeInput(e.target.value)} placeholder="0.0" inputMode="decimal" className="num" disabled={disabled} />
                  <Button variant="secondary" disabled={disabled} onClick={() => setStakeInput(formatUnits(balance, 18))}>Max</Button>
                </div>
              </Field>
              <div style={{ marginTop: 10 }}>
                <GaslessNotice />
              </div>
              <div className="panel-actions">
                <Button loading={relayBusy && relayKind === "stake"} disabled={disabled || !user || !stakeInput || stakeError !== null} onClick={handleGaslessStake}>
                  Stake (gasless)
                </Button>
                <Button variant="secondary" loading={isActive("Stake")} disabled={disabled || !stakeInput || stakeError !== null} onClick={handleStake}>
                  Stake (pay gas)
                </Button>
              </div>
              {relayKind === "stake" && (
                <RelayStatus chainId={project.chainId} status={relayStatus} request={relay.request} pollError={relay.pollError} failure={relayFailure} onSelfPay={handleStake} />
              )}
            </div>

            {canClaimTokens && (
              <div className="panel-section">
                <h3 className="label">Claim my tokens</h3>
                <GaslessNotice />
                <div className="panel-actions">
                  <Button loading={relayBusy && relayKind === "claim"} disabled={disabled || !user} onClick={handleGaslessClaimTokens}>
                    Claim tokens (gasless)
                  </Button>
                  <Button variant="secondary" loading={isActive("Claim tokens")} disabled={disabled} onClick={handleClaimTokens}>
                    Claim tokens (pay gas)
                  </Button>
                </div>
                {relayKind === "claim" && (
                  <RelayStatus chainId={project.chainId} status={relayStatus} request={relay.request} pollError={relay.pollError} failure={relayFailure} onSelfPay={handleClaimTokens} />
                )}
              </div>
            )}

            <div className="panel-section">
              {voteLocked && (
                <InlineAlert tone="warning" title="Vote-locked" className="panel-gap">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Lock size={12} aria-hidden="true" />
                    You voted on an active milestone. Unstaking opens when the poll closes.
                  </span>
                </InlineAlert>
              )}
              <Field label="Unstake (you pay gas)" error={unstakeError ?? undefined}>
                <div className="input-row">
                  <Input value={unstakeInput} onChange={e => setUnstakeInput(e.target.value)} placeholder="0.0" inputMode="decimal" className="num" disabled={disabled || voteLocked} />
                  <Button variant="secondary" disabled={disabled || voteLocked} onClick={() => setUnstakeInput(formatUnits(staked, 18))}>Max</Button>
                  <Button loading={isActive("Unstake")} disabled={disabled || voteLocked || !unstakeInput || unstakeError !== null} onClick={handleUnstake}>Unstake</Button>
                </div>
              </Field>
            </div>

            <div className="panel-section stack-sm">
              <Button className="btn-block" loading={isActive("Claim yield")} disabled={disabled || claimable === ZERO} onClick={handleClaim}>
                Claim yield (you pay gas)
              </Button>
              {refundOpen && (
                <>
                  <Button
                    variant="secondary"
                    className="btn-block"
                    loading={isActive("Refund")}
                    disabled={disabled || (crowdfundFailed ? deposit === ZERO : needUnstake)}
                    onClick={handleRefund}
                  >
                    Refund (you pay gas)
                  </Button>
                  {needUnstake && <p className="panel-note" style={{ fontSize: 12 }}>Unstake first: staked tokens must be returned to your wallet.</p>}
                </>
              )}
            </div>

            {busy && step && (
              <p className="tx-status" role="status">
                <Spinner size={12} />
                <span>{step}: confirm in your wallet and wait for confirmation.</span>
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
