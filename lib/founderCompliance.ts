import type { ComplianceState } from "@/lib/api";

/** Founder-voice explanation of the revenue compliance state of their own project. */
export const FOUNDER_COMPLIANCE_TEXT: Record<ComplianceState | "not_checked", string> = {
  OK: "Revenue routed to the protocol matches what your revenue wallet received.",
  WARNED:
    "Routed revenue is below what your revenue wallet received. Deposit the missing revenue to the revenue router to clear this.",
  ESCALATED:
    "Staff are reviewing this. Fix the shortfall and contact support or file a complaint if you disagree.",
  RESOLVED: "A previous shortfall was reviewed and resolved by staff.",
  SHUTDOWN:
    "Staff shut this project down after a revenue shortfall that was not corrected. Revenue sharing and new milestone work are stopped. Contact support if you disagree.",
  not_checked: "This project has not been checked yet.",
};
