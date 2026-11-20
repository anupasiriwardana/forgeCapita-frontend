import { toast } from "@/lib/toast";

export const WALLET_CANCELLED_MESSAGE = "Request cancelled in wallet";

/** True when the user rejected a signature or transaction in their wallet (EIP-1193 code 4001 or viem's error). */
export function isUserRejection(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: unknown; code?: unknown; message?: unknown };
  return (
    e.name === "UserRejectedRequestError" ||
    e.code === 4001 ||
    (typeof e.message === "string" && /user rejected|user denied/i.test(e.message))
  );
}

/** Short, safe text for a wallet or contract error: viem's one-line shortMessage, never the multi-line details. */
export function txErrorMessage(err: unknown, fallback = "Transaction failed"): string {
  if (typeof err === "object" && err !== null) {
    const e = err as { shortMessage?: unknown };
    if (typeof e.shortMessage === "string" && e.shortMessage.trim() !== "") return e.shortMessage;
  }
  return fallback;
}

/** Toast for a failed wallet action: a calm info toast when the user cancelled, otherwise a short error. */
export function toastTxError(err: unknown, fallback = "Transaction failed"): void {
  if (isUserRejection(err)) {
    toast.info(WALLET_CANCELLED_MESSAGE);
    return;
  }
  toast.error(txErrorMessage(err, fallback));
}
