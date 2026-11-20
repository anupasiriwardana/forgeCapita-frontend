"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";
import { listProjects, shortAddr, type ProjectDto } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { formatTokenAmount } from "@/lib/format";
import { buttonClass } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

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
        <div role="status" className="stack-sm">
          <span className="sr-only">Loading your project tokens</span>
          <Skeleton height={40} radius="var(--r-md)" />
          <Skeleton height={40} radius="var(--r-md)" />
        </div>
      ) : held.length === 0 ? (
        <p className="panel-note">No project tokens in this wallet on {networkName}</p>
      ) : (
        <div role="radiogroup" aria-label="Your project tokens" className="stack-sm">
          {held.map(({ option, balance }) => {
            const active = option.address.toLowerCase() === selected.toLowerCase();
            return (
              <button
                type="button"
                key={option.address}
                role="radio"
                aria-checked={active}
                className={`${buttonClass(active ? "subtle" : "secondary")} token-option`}
                onClick={() => onSelect(option.address, balance)}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{option.label}</span>
                <span className="mono num">{formatTokenAmount(balance)}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="field-hint">Switch network to see tokens on the other chain. Staked tokens must be unstaked first.</p>
    </div>
  );
}
