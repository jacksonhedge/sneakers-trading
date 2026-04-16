/* -------------------------------------------------------------------------- */
/*  Payment Methods Catalog                                                   */
/*                                                                            */
/*  Every deposit/withdrawal rail Sneakers supports or plans to support. Used */
/*  by the Deposit/Withdraw modal and future per-platform funding flows.      */
/* -------------------------------------------------------------------------- */

export type PaymentCategory =
  | "Bank"
  | "Card"
  | "Wallet"
  | "Crypto"
  | "Retail"
  | "Gaming";

export type PaymentSpeed = "Instant" | "Same-day" | "1–3 days" | "3–5 days";

export type PaymentMethod = {
  id: string;
  name: string;
  category: PaymentCategory;
  mono: string;
  tint: string;
  /** Typical funding speed — display only. */
  speed: PaymentSpeed;
  /** Sneakers processing fee bps (100 = 1%). 0 = free. */
  feeBps: number;
  /** Supported directions. */
  supports: { deposit: boolean; withdraw: boolean };
  /** Optional min/max per transaction in USD. */
  min?: number;
  max?: number;
  /** Rolled out to users yet. */
  status: "Live" | "Beta" | "Coming soon";
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  // ── Bank rails
  { id: "ach",     name: "ACH Bank Transfer",  category: "Bank",   mono: "AC", tint: "#4A90E2", speed: "1–3 days", feeBps:   0, supports: { deposit: true, withdraw: true  }, min:  10, max: 25_000, status: "Live" },
  { id: "plaid",   name: "Instant Bank (Plaid)", category: "Bank", mono: "PL", tint: "#00D4AA", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true  }, min:  10, max: 10_000, status: "Live" },
  { id: "trust",   name: "Trustly",            category: "Bank",   mono: "TR", tint: "#0EE06E", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true  }, min:  10, max: 10_000, status: "Live" },
  { id: "wire",    name: "Wire Transfer",      category: "Bank",   mono: "WR", tint: "#6B7280", speed: "Same-day", feeBps:   0, supports: { deposit: true, withdraw: true  }, min: 500, max: 500_000, status: "Live" },
  { id: "check",   name: "Paper Check",        category: "Bank",   mono: "CK", tint: "#9CA3AF", speed: "3–5 days", feeBps:   0, supports: { deposit: false, withdraw: true }, min:  50, max: 50_000, status: "Live" },
  { id: "vip",     name: "VIP Preferred",      category: "Bank",   mono: "VP", tint: "#B08A3E", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true  }, min:  10, max: 10_000, status: "Live" },

  // ── Cards
  { id: "visa",    name: "Visa",               category: "Card",   mono: "VI", tint: "#1A1F71", speed: "Instant",  feeBps: 250, supports: { deposit: true, withdraw: true }, min:  10, max:  5_000, status: "Live" },
  { id: "mc",      name: "Mastercard",         category: "Card",   mono: "MC", tint: "#EB001B", speed: "Instant",  feeBps: 250, supports: { deposit: true, withdraw: true }, min:  10, max:  5_000, status: "Live" },
  { id: "amex",    name: "American Express",   category: "Card",   mono: "AX", tint: "#2E77BB", speed: "Instant",  feeBps: 290, supports: { deposit: true, withdraw: false }, min:  10, max:  5_000, status: "Live" },
  { id: "disc",    name: "Discover",           category: "Card",   mono: "DI", tint: "#FF6000", speed: "Instant",  feeBps: 250, supports: { deposit: true, withdraw: false }, min:  10, max:  5_000, status: "Live" },
  { id: "playp",   name: "Prepaid Play+",      category: "Card",   mono: "P+", tint: "#0066CC", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true  }, min:  10, max:  5_000, status: "Live" },

  // ── Wallets
  { id: "paypal",  name: "PayPal",             category: "Wallet", mono: "PP", tint: "#003087", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true }, min:  10, max: 10_000, status: "Live" },
  { id: "venmo",   name: "Venmo",              category: "Wallet", mono: "VN", tint: "#3D95CE", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true }, min:  10, max:  5_000, status: "Live" },
  { id: "apay",    name: "Apple Pay",          category: "Wallet", mono: "AP", tint: "#000000", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: false }, min: 10, max:  5_000, status: "Live" },
  { id: "gpay",    name: "Google Pay",         category: "Wallet", mono: "GP", tint: "#4285F4", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: false }, min: 10, max:  5_000, status: "Beta" },
  { id: "cashapp", name: "Cash App",           category: "Wallet", mono: "CA", tint: "#00D632", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true }, min:  10, max:  7_500, status: "Live" },
  { id: "skrill",  name: "Skrill",             category: "Wallet", mono: "SK", tint: "#862165", speed: "Instant",  feeBps: 100, supports: { deposit: true, withdraw: true }, min:  10, max: 10_000, status: "Beta" },
  { id: "neteller",name: "Neteller",           category: "Wallet", mono: "NT", tint: "#00AC41", speed: "Instant",  feeBps: 100, supports: { deposit: true, withdraw: true }, min:  10, max: 10_000, status: "Beta" },

  // ── Crypto
  { id: "btc",     name: "Bitcoin (BTC)",      category: "Crypto", mono: "BT", tint: "#F7931A", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true }, min:  20, max: 100_000, status: "Live" },
  { id: "eth",     name: "Ethereum (ETH)",     category: "Crypto", mono: "ET", tint: "#627EEA", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true }, min:  20, max: 100_000, status: "Live" },
  { id: "usdc",    name: "USDC",               category: "Crypto", mono: "UC", tint: "#2775CA", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true }, min:  10, max: 250_000, status: "Live" },
  { id: "usdt",    name: "USDT",               category: "Crypto", mono: "UT", tint: "#26A17B", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true }, min:  10, max: 250_000, status: "Live" },
  { id: "sol",     name: "Solana (SOL)",       category: "Crypto", mono: "SO", tint: "#9945FF", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true }, min:  10, max: 100_000, status: "Live" },
  { id: "ltc",     name: "Litecoin (LTC)",     category: "Crypto", mono: "LT", tint: "#A6A9AA", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true }, min:  10, max:  50_000, status: "Live" },
  { id: "doge",    name: "Dogecoin (DOGE)",    category: "Crypto", mono: "DO", tint: "#C2A633", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true }, min:  10, max:  25_000, status: "Live" },
  { id: "base",    name: "Base USDC",          category: "Crypto", mono: "BS", tint: "#0052FF", speed: "Instant",  feeBps:   0, supports: { deposit: true, withdraw: true }, min:  10, max: 250_000, status: "Beta" },

  // ── Retail / Kiosk
  { id: "pnm",     name: "PayNearMe",          category: "Retail", mono: "PN", tint: "#E84E1C", speed: "Same-day", feeBps: 250, supports: { deposit: true,  withdraw: false }, min: 20, max:  2_000, status: "Live" },
  { id: "mg",      name: "MoneyGram",          category: "Retail", mono: "MG", tint: "#EE2A23", speed: "Same-day", feeBps: 250, supports: { deposit: true,  withdraw: true  }, min: 20, max:  5_000, status: "Live" },
  { id: "cage",    name: "Casino Cage",        category: "Retail", mono: "CG", tint: "#8A2E2E", speed: "Instant",  feeBps:   0, supports: { deposit: true,  withdraw: true  }, min: 20, max: 100_000, status: "Live" },

  // ── Gaming-native
  { id: "playp2",  name: "Play+ Prepaid",      category: "Gaming", mono: "P+", tint: "#0066CC", speed: "Instant",  feeBps:   0, supports: { deposit: true,  withdraw: true  }, min: 10, max: 10_000, status: "Live" },
  { id: "bankapp", name: "Operator Wallet",    category: "Gaming", mono: "OW", tint: "#00FF88", speed: "Instant",  feeBps:   0, supports: { deposit: true,  withdraw: true  }, min:  1, max: 500_000, status: "Live" },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

export const PAYMENT_CATEGORIES: PaymentCategory[] = [
  "Bank",
  "Card",
  "Wallet",
  "Crypto",
  "Retail",
  "Gaming",
];

export function formatFee(bps: number): string {
  if (bps === 0) return "Free";
  return `${(bps / 100).toFixed(2)}%`;
}

export function formatLimit(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}
