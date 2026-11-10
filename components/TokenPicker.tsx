"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { listProjects, shortAddr, type ProjectDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { formatTokenAmount } from "@/lib/format";

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

async function fetchAllProjects(): Promise<ProjectDto[]> {
  const all: ProjectDto[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await listProjects({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
  }
  return all;
}

interface TokenOption {
  address: `0x${string}`;
  label: string;
}

export interface TokenPickerProps {
  chainId: number;
  wallet: `0x${string}` | undefined;
  selected: string;
  networkName: string;
  /** Called with the token address and the wallet's balance of it in wei. */
  onSelect: (address: string, balance: bigint) => void;
}

export function TokenPicker({ chainId, wallet, selected, networkName, onSelect }: TokenPickerProps) {
  const { data: projects, isLoading: loadingProjects } = useQuery({
    queryKey: ["p2p-token-projects"],
    queryFn: fetchAllProjects,
    staleTime: 60_000,
  });

  const seen = new Set<string>();
  const options: TokenOption[] = [];
  for (const p of projects ?? []) {
    const key = p.tokenAddress.toLowerCase();
    if (p.chainId !== chainId || seen.has(key)) continue;
    seen.add(key);
    options.push({ address: p.tokenAddress as `0x${string}`, label: p.profile?.name ?? shortAddr(p.tokenAddress) });
  }

  const { data: balances, isLoading: loadingBalances } = useReadContracts({
    contracts: wallet
      ? options.map((o) => ({
          address: o.address,
          abi: ABIS.token,
          functionName: "balanceOf" as const,
          args: [wallet] as const,
          chainId,
        }))
      : [],
    query: { enabled: !!wallet && options.length > 0 },
  });

  const held: { option: TokenOption; balance: bigint }[] = [];
  options.forEach((option, i) => {
    const r = balances?.[i];
    if (r && r.status === "success" && typeof r.result === "bigint" && r.result > BigInt(0)) {
      held.push({ option, balance: r.result });
    }
  });

  return (
    <div>
      {loadingProjects || loadingBalances ? (
        <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Loading your project tokens...</div>
      ) : held.length === 0 ? (
        <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          No project tokens in this wallet on {networkName}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {held.map(({ option, balance }) => {
            const active = option.address.toLowerCase() === selected.toLowerCase();
            return (
              <button
                type="button"
                key={option.address}
                className={active ? "btn-primary" : "btn-secondary"}
                style={{ display: "flex", justifyContent: "space-between", width: "100%" }}
                onClick={() => onSelect(option.address, balance)}
              >
                <span>{option.label}</span>
                <span style={{ fontFamily: "monospace" }}>{formatTokenAmount(balance)}</span>
              </button>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
        Switch network to see tokens on the other chain. Staked tokens must be unstaked first.
      </div>
    </div>
  );
}
