/* -------------------------------------------------------------------------- */
/*  Wallet — crypto wallet connection registry                                */
/*                                                                            */
/*  This is pure metadata + localStorage right now. Real provider hookup      */
/*  (wagmi / viem / @solana/wallet-adapter) ships in a later PR. The addresses */
/*  here are read-only — we never store private keys or signing material.     */
/* -------------------------------------------------------------------------- */

export type ChainId = "ethereum" | "polygon" | "base" | "arbitrum" | "solana";
export type WalletProvider =
  | "metamask" | "coinbase" | "walletconnect" | "phantom" | "rabby" | "ledger";

export interface WalletConnection {
  provider: WalletProvider;
  address: string;
  chainId: ChainId;
  label?: string;
  connectedAt: number;
}

export interface WalletMeta {
  id: WalletProvider;
  name: string;
  emoji: string;
  chains: ChainId[];
  /** Official install/download URL — opened when user doesn't have it. */
  installUrl: string;
}

export const WALLETS: WalletMeta[] = [
  { id: "metamask",      name: "MetaMask",         emoji: "🦊", chains: ["ethereum","polygon","base","arbitrum"], installUrl: "https://metamask.io/download/" },
  { id: "coinbase",      name: "Coinbase Wallet",  emoji: "🔵", chains: ["ethereum","polygon","base","arbitrum"], installUrl: "https://www.coinbase.com/wallet/downloads" },
  { id: "walletconnect", name: "WalletConnect",    emoji: "🔗", chains: ["ethereum","polygon","base","arbitrum"], installUrl: "https://walletconnect.com" },
  { id: "phantom",       name: "Phantom",          emoji: "👻", chains: ["solana"],                               installUrl: "https://phantom.app/download" },
  { id: "rabby",         name: "Rabby",            emoji: "🐇", chains: ["ethereum","polygon","base","arbitrum"], installUrl: "https://rabby.io/" },
  { id: "ledger",        name: "Ledger (hardware)",emoji: "📘", chains: ["ethereum","polygon","base","arbitrum","solana"], installUrl: "https://www.ledger.com/ledger-live" },
];

export const CHAIN_META: Record<ChainId, { name: string; emoji: string; color: string; usedBy: string[] }> = {
  ethereum: { name: "Ethereum", emoji: "Ξ",  color: "#627eea", usedBy: ["Polymarket", "Limitless"] },
  polygon:  { name: "Polygon",  emoji: "🟣", color: "#8247e5", usedBy: ["Polymarket"] },
  base:     { name: "Base",     emoji: "🔷", color: "#0052ff", usedBy: ["Coinbase Predict"] },
  arbitrum: { name: "Arbitrum", emoji: "🔵", color: "#28a0f0", usedBy: ["ProphetX"] },
  solana:   { name: "Solana",   emoji: "◎",  color: "#9945ff", usedBy: ["Hedgehog", "Drift"] },
};

const STORAGE_KEY = "otoole:wallets:v1";

export function loadWallets(): WalletConnection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveWallet(w: WalletConnection) {
  if (typeof window === "undefined") return;
  const list = loadWallets().filter((x) => !(x.address === w.address && x.chainId === w.chainId));
  list.push(w);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function removeWallet(address: string, chainId: ChainId) {
  if (typeof window === "undefined") return;
  const list = loadWallets().filter((x) => !(x.address === address && x.chainId === chainId));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function truncateAddress(a: string): string {
  if (!a) return "";
  if (a.length <= 14) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Simple validity check — permissive, not a full checksum verify. */
export function isPlausibleAddress(a: string, chain: ChainId): boolean {
  if (!a) return false;
  if (chain === "solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
  return /^0x[a-fA-F0-9]{40}$/.test(a);
}
