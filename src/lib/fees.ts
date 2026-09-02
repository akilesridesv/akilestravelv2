import { formatUSD } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Two-sided fee model.
//  · Tourist service fee: ADDED on top of the price at checkout (platform +
//    ticket admin). Provider price $100 + 10% = tourist pays $110.
//  · Provider commission: RETAINED from the provider (platform + payment
//    gateway). Of $100, 10% commission → provider is paid $90.
// Both are configured per provider, falling back to a global default.
// ---------------------------------------------------------------------------

export type FeeType = "percent" | "fixed";

export interface FeeDefaults {
  tourist_fee_type: FeeType;
  tourist_fee_value: number;
  commission_type: FeeType;
  commission_value: number;
}

export const FALLBACK_FEE_DEFAULTS: FeeDefaults = {
  tourist_fee_type: "percent",
  tourist_fee_value: 10,
  commission_type: "percent",
  commission_value: 10,
};

/** A provider's optional fee overrides (null fields => use the global default). */
export interface ProviderFeeOverrides {
  tourist_fee_type?: FeeType | null;
  tourist_fee_value?: number | null;
  commission_type?: FeeType | null;
  commission_value?: number | null;
}

export interface ResolvedFees {
  tourist: { type: FeeType; value: number };
  commission: { type: FeeType; value: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function apply(base: number, type: FeeType, value: number): number {
  const v = type === "percent" ? (base * value) / 100 : value;
  return Math.max(0, round2(v));
}

/** Effective fees for a provider, falling back to the global default. */
export function resolveFees(
  provider: ProviderFeeOverrides | null | undefined,
  defaults: FeeDefaults = FALLBACK_FEE_DEFAULTS
): ResolvedFees {
  return {
    tourist: {
      type: (provider?.tourist_fee_type as FeeType) || defaults.tourist_fee_type,
      value: provider?.tourist_fee_value ?? defaults.tourist_fee_value,
    },
    commission: {
      type: (provider?.commission_type as FeeType) || defaults.commission_type,
      value: provider?.commission_value ?? defaults.commission_value,
    },
  };
}

export interface FeeBreakdown {
  base: number; // provider price for the whole party
  touristFee: number; // added on top for the tourist
  total: number; // what the tourist pays
  commission: number; // retained from the provider
  payout: number; // what the provider receives
  touristFeeLabel: string; // "10%" or "$5"
  commissionLabel: string;
}

export function feeLabel(type: FeeType, value: number): string {
  return type === "percent" ? `${value}%` : formatUSD(value);
}

/** Full money breakdown for a booking whose party price is `base`. */
export function computeFees(base: number, fees: ResolvedFees): FeeBreakdown {
  const touristFee = apply(base, fees.tourist.type, fees.tourist.value);
  const commission = apply(base, fees.commission.type, fees.commission.value);
  return {
    base: round2(base),
    touristFee,
    total: round2(base + touristFee),
    commission,
    payout: round2(base - commission),
    touristFeeLabel: feeLabel(fees.tourist.type, fees.tourist.value),
    commissionLabel: feeLabel(fees.commission.type, fees.commission.value),
  };
}
