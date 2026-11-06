export interface FeeOverrides {
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

interface FeeEstimator {
  estimateFeesPerGas(): Promise<{ maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }>;
}

const MAX_FEE_BUFFER = BigInt(2);

/**
 * Fresh EIP-1559 fee overrides with a 2x maxFeePerGas buffer so a wallet's stale
 * estimate cannot fall below a base fee that moved. Returns {} (wallet decides)
 * for legacy-fee chains or on any error; never throws.
 */
export async function getFeeOverrides(client: FeeEstimator | undefined): Promise<FeeOverrides> {
  if (!client) return {};
  try {
    const { maxFeePerGas, maxPriorityFeePerGas } = await client.estimateFeesPerGas();
    if (maxFeePerGas === undefined || maxPriorityFeePerGas === undefined) return {};
    return { maxFeePerGas: maxFeePerGas * MAX_FEE_BUFFER, maxPriorityFeePerGas };
  } catch {
    return {};
  }
}
