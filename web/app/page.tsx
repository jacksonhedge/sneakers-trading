"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  askOToole,
  CATEGORY_META,
  formatCloseDate,
  formatPct,
  formatVolume,
  getMarkets,
  getOpportunities,
  getStats,
  type CategoryId,
  type CategoryStat,
  type Market,
  type Opportunity,
} from "@/lib/api";
import {
  CONNECTABLE_SITES,
  SPORTS_SITES,
  findSite,
  loadConnections,
  saveConnection,
  type Connection,
} from "@/lib/connectedSites";
import {
  DEFAULT_OTOOLE_SETTINGS,
  describeMode,
  loadOTooleSettings,
  saveOTooleSettings,
  type OTooleSettings,
  type OTooleMode,
  type OTooleStrategy,
} from "@/lib/otoole";
import {
  ADDONS,
  PLANS,
  calculateMonthly,
  canBuyAddon,
  hasFeature,
  loadAddons,
  loadTier,
  planFor,
  saveAddons,
  saveTier,
  type AddOnId,
  type Tier,
} from "@/lib/subscriptions";
import {
  CHAIN_META,
  WALLETS,
  isPlausibleAddress,
  loadWallets,
  removeWallet,
  saveWallet,
  truncateAddress,
  type ChainId,
  type WalletConnection,
  type WalletProvider,
} from "@/lib/wallet";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

interface LocationState {
  label: string;       // display: "TX" or "Austin, TX"
  state?: string;
  lat?: number;
  lng?: number;
}

const LOC_KEY = "otoole:location:v1";

function loadLocation(): LocationState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOC_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocation(loc: LocationState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOC_KEY, JSON.stringify(loc));
}

type Mode = "simple" | "medium" | "terminal";
type Theme = "light" | "dark";
type FeedFilter = "all" | "new" | "trending";
type ChatMsg = { id: string; text: string; isUser: boolean; time: string };

function faviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
}

type PlatformMeta = { short: string; bg: string; color: string; logo: string };

const PLATFORM_BADGE: Record<string, PlatformMeta> = {
  kalshi:                  { short: "KAL",  bg: "rgba(0,196,140,0.12)",  color: "#00C48C", logo: faviconUrl("kalshi.com") },
  polymarket:              { short: "POLY", bg: "rgba(47,107,255,0.12)",  color: "#2F6BFF", logo: faviconUrl("polymarket.com") },
  "draftkings-predict":    { short: "DKP",  bg: "rgba(83,211,55,0.12)",   color: "#53D337", logo: faviconUrl("draftkings.com") },
  dkp:                     { short: "DKP",  bg: "rgba(83,211,55,0.12)",   color: "#53D337", logo: faviconUrl("draftkings.com") },
  "fanduel-predict":       { short: "FDP",  bg: "rgba(20,147,255,0.12)",  color: "#1493FF", logo: faviconUrl("fanduel.com") },
  fdp:                     { short: "FDP",  bg: "rgba(20,147,255,0.12)",  color: "#1493FF", logo: faviconUrl("fanduel.com") },
  "draftkings-sportsbook": { short: "DK",   bg: "rgba(83,211,55,0.12)",   color: "#53D337", logo: faviconUrl("draftkings.com") },
  dk:                      { short: "DK",   bg: "rgba(83,211,55,0.12)",   color: "#53D337", logo: faviconUrl("draftkings.com") },
  "fanduel-sportsbook":    { short: "FD",   bg: "rgba(20,147,255,0.12)",  color: "#1493FF", logo: faviconUrl("fanduel.com") },
  fd:                      { short: "FD",   bg: "rgba(20,147,255,0.12)",  color: "#1493FF", logo: faviconUrl("fanduel.com") },
  coinbase:                { short: "CB",   bg: "rgba(22,82,240,0.12)",   color: "#1652F0", logo: faviconUrl("coinbase.com") },
  cbp:                     { short: "CB",   bg: "rgba(22,82,240,0.12)",   color: "#1652F0", logo: faviconUrl("coinbase.com") },
  robinhood:               { short: "RH",   bg: "rgba(0,200,5,0.12)",     color: "#00C805", logo: faviconUrl("robinhood.com") },
  rh:                      { short: "RH",   bg: "rgba(0,200,5,0.12)",     color: "#00C805", logo: faviconUrl("robinhood.com") },
  fliff:                   { short: "FLF",  bg: "rgba(142,92,255,0.12)",  color: "#8E5CFF", logo: faviconUrl("getfliff.com") },
  predictit:               { short: "PI",   bg: "rgba(7,160,187,0.12)",   color: "#07A0BB", logo: faviconUrl("predictit.org") },
  pit:                     { short: "PI",   bg: "rgba(7,160,187,0.12)",   color: "#07A0BB", logo: faviconUrl("predictit.org") },
  prophetx:                { short: "PRX",  bg: "rgba(124,92,255,0.12)",  color: "#7C5CFF", logo: faviconUrl("prophetx.co") },
  prx:                     { short: "PRX",  bg: "rgba(124,92,255,0.12)",  color: "#7C5CFF", logo: faviconUrl("prophetx.co") },
  og:                      { short: "OG",   bg: "rgba(240,77,103,0.12)",  color: "#F04D67", logo: faviconUrl("og.com") },
  cryptocom:               { short: "CRY",  bg: "rgba(17,153,250,0.12)",  color: "#1199FA", logo: faviconUrl("crypto.com") },
  crp:                     { short: "CRY",  bg: "rgba(17,153,250,0.12)",  color: "#1199FA", logo: faviconUrl("crypto.com") },
  limitless:               { short: "LIM",  bg: "rgba(179,124,255,0.12)", color: "#B37CFF", logo: faviconUrl("limitless.exchange") },
  lim:                     { short: "LIM",  bg: "rgba(179,124,255,0.12)", color: "#B37CFF", logo: faviconUrl("limitless.exchange") },
  prizepicks:              { short: "PP",   bg: "rgba(124,92,255,0.12)",  color: "#7C5CFF", logo: faviconUrl("prizepicks.com") },
  underdog:                { short: "UD",   bg: "rgba(241,192,74,0.12)",  color: "#F1C04A", logo: faviconUrl("underdogfantasy.com") },
  sleeper:                 { short: "SL",   bg: "rgba(0,201,199,0.12)",   color: "#00C9C7", logo: faviconUrl("sleeper.com") },
  novig:                   { short: "NV",   bg: "rgba(23,155,231,0.12)",  color: "#179BE7", logo: faviconUrl("novig.us") },
  sporttrade:              { short: "ST",   bg: "rgba(0,135,91,0.12)",    color: "#00875B", logo: faviconUrl("sporttrade.com") },
  spt:                     { short: "ST",   bg: "rgba(0,135,91,0.12)",    color: "#00875B", logo: faviconUrl("sporttrade.com") },
  mgm:                     { short: "MGM",  bg: "rgba(201,162,76,0.12)",  color: "#C9A24C", logo: faviconUrl("betmgm.com") },
  czr:                     { short: "CZR",  bg: "rgba(0,165,80,0.12)",    color: "#00A550", logo: faviconUrl("caesars.com") },
  espn:                    { short: "ESPN", bg: "rgba(213,37,52,0.12)",   color: "#D52534", logo: faviconUrl("espnbet.com") },
  fan:                     { short: "FAN",  bg: "rgba(229,50,46,0.12)",   color: "#E5322E", logo: faviconUrl("betfanatics.com") },
  brv:                     { short: "BR",   bg: "rgba(18,181,241,0.12)",  color: "#12B5F1", logo: faviconUrl("betrivers.com") },
  hr:                      { short: "HR",   bg: "rgba(212,175,55,0.12)",  color: "#D4AF37", logo: faviconUrl("hardrock.bet") },
};

const FILTER_CATS: Array<{ id: string; label: string; emoji: string }> = [
  { id: "all",       label: "All Markets", emoji: "◈" },
  { id: "sports",    label: "Sports",      emoji: "🏆" },
  { id: "politics",  label: "Elections",   emoji: "🗳️" },
  { id: "economics", label: "Economics",   emoji: "📈" },
  { id: "crypto",    label: "Crypto",      emoji: "₿"  },
  { id: "tech",      label: "Tech",        emoji: "💻" },
  { id: "other",     label: "Other",       emoji: "🌐" },
];

const CHIP_REPLIES = [
  "Scanning all markets for edge... Found 3 opportunities: Fed Rate Cut YES (72%, underpriced vs SOFR futures), Recession NO (strong momentum), Nvidia YES (earnings catalyst). Confidence: High.",
  "Whale activity in the last 2h: $180K on BTC NO at 66¢, $95K on Fed Cut YES at 68¢, $42K on Brazil World Cup YES. Smart money is short crypto and long rate cuts.",
  "Your max single-position exposure is 18% (BTC YES). Total risk: $620 unrealized. Recommend capping new entries at 10% per market. Current portfolio health: Good.",
  "Top 3 value bets right now: (1) Fed Cut YES at 72¢ — political pressure building. (2) Recession NO at 59¢ — labor data still strong. (3) Nvidia YES at 61¢ — earnings in 4 days.",
];

function nowTime() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function clock24() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

export default function Page() {
  const [mode, setMode] = useState<Mode>("medium");
  const [theme, setTheme] = useState<Theme>("light");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [stats, setStats] = useState<CategoryStat[]>([]);
  const [totalMarkets, setTotalMarkets] = useState(0);
  const [clock, setClock] = useState("--:--:--");
  const [autoOn, setAutoOn] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<ChatMsg[]>([
    {
      id: "init-1",
      isUser: false,
      time: "9:05 PM",
      text: "Good evening. I've scanned active markets across Kalshi and Polymarket. Ask me about any specific market or click a chip below.",
    },
  ]);
  const [termChat, setTermChat] = useState<ChatMsg[]>([
    { id: "t1", isUser: false, time: "9:05 PM", text: "Scanning Kalshi + Polymarket. Momentum detected across Economics markets." },
  ]);
  const [termInput, setTermInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Record<string, Connection>>({});
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [location, setLocation] = useState<LocationState | null>(null);
  const [locModalOpen, setLocModalOpen] = useState(false);
  const [configureSiteId, setConfigureSiteId] = useState<string | null>(null);
  const [configureIntentMarket, setConfigureIntentMarket] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [sportsModalOpen, setSportsModalOpen] = useState(false);
  const [configPlatformsOpen, setConfigPlatformsOpen] = useState(false);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [oppsFreshAt, setOppsFreshAt] = useState(0);
  const [oppsLoading, setOppsLoading] = useState(true);
  const [otooleSettings, setOTooleSettings] = useState<OTooleSettings>(DEFAULT_OTOOLE_SETTINGS);
  const [otooleModalOpen, setOTooleModalOpen] = useState(false);
  const [otooleDraft, setOTooleDraft] = useState<OTooleSettings>(DEFAULT_OTOOLE_SETTINGS);
  const [tier, setTier] = useState<Tier>("free");
  const [addons, setAddons] = useState<AddOnId[]>([]);
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [subModalTrigger, setSubModalTrigger] = useState<string | null>(null);
  const [subPricingView, setSubPricingView] = useState<"individual" | "business">("individual");
  const [view, setView] = useState<"dashboard" | "signals">("dashboard");
  const [signalsKindFilter, setSignalsKindFilter] = useState<"all" | "arbitrage" | "value">("all");
  const [signalsMinEdge, setSignalsMinEdge] = useState<number>(0);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [wallets, setWallets] = useState<WalletConnection[]>([]);
  const [connectWalletProvider, setConnectWalletProvider] = useState<WalletProvider | null>(null);
  const [connectAddressDraft, setConnectAddressDraft] = useState("");
  const [connectChainDraft, setConnectChainDraft] = useState<ChainId>("ethereum");
  const [connectError, setConnectError] = useState<string | null>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const termMsgsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConnections(loadConnections());
    setLocation(loadLocation());
    setOTooleSettings(loadOTooleSettings());
    setTier(loadTier());
    setAddons(loadAddons());
    setWallets(loadWallets());
  }, []);

  function toggleAddon(id: AddOnId) {
    setAddons((prev) => {
      const next = prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id];
      saveAddons(next);
      return next;
    });
  }

  function openWalletFlow(provider: WalletProvider) {
    const meta = WALLETS.find((w) => w.id === provider);
    setConnectWalletProvider(provider);
    setConnectChainDraft(meta?.chains[0] ?? "ethereum");
    setConnectAddressDraft("");
    setConnectError(null);
  }

  function closeConnectWallet() {
    setConnectWalletProvider(null);
    setConnectAddressDraft("");
    setConnectError(null);
  }

  function confirmConnectWallet() {
    if (!connectWalletProvider) return;
    const addr = connectAddressDraft.trim();
    if (!isPlausibleAddress(addr, connectChainDraft)) {
      setConnectError(
        connectChainDraft === "solana"
          ? "Not a valid Solana address."
          : "Not a valid EVM address (0x… 40 hex chars).",
      );
      return;
    }
    saveWallet({
      provider: connectWalletProvider,
      address: addr,
      chainId: connectChainDraft,
      connectedAt: Date.now(),
    });
    setWallets(loadWallets());
    closeConnectWallet();
  }

  function disconnectWallet(w: WalletConnection) {
    removeWallet(w.address, w.chainId);
    setWallets(loadWallets());
  }

  function openSubscriptions(triggerMsg?: string) {
    setSubModalTrigger(triggerMsg ?? null);
    setSubModalOpen(true);
  }

  function selectTier(t: Tier) {
    saveTier(t);
    setTier(t);
    // Drop any add-ons this tier can't support
    setAddons((prev) => {
      const pruned = prev.filter((id) => canBuyAddon(t, id));
      if (pruned.length !== prev.length) saveAddons(pruned);
      return pruned;
    });
    setSubModalOpen(false);
    setSubModalTrigger(null);
  }

  function tryChangeMode(m: Mode) {
    if (m === "terminal" && !hasFeature(tier, "view_terminal")) {
      openSubscriptions("Terminal mode is a Pro feature.");
      return;
    }
    setMode(m);
  }

  function openOTooleSettings() {
    setOTooleDraft({ ...otooleSettings });
    setOTooleModalOpen(true);
  }

  function saveOTooleDraft() {
    saveOTooleSettings(otooleDraft);
    setOTooleSettings(otooleDraft);
    setOTooleModalOpen(false);
  }

  function patchDraft<K extends keyof OTooleSettings>(key: K, value: OTooleSettings[K]) {
    setOTooleDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleDraftPlatform(id: string) {
    setOTooleDraft((d) => {
      const has = d.platforms.includes(id);
      return { ...d, platforms: has ? d.platforms.filter((p) => p !== id) : [...d.platforms, id] };
    });
  }

  type OTPreset = "conservative" | "balanced" | "aggressive";
  function applyOTPreset(preset: OTPreset) {
    const eliteOk = hasFeature(tier, "otoole_execution");
    const common = { platforms: ["kalshi", "polymarket"] as string[], updatedAt: 0 };
    if (preset === "conservative") {
      setOTooleDraft({
        ...otooleDraft,
        mode: hasFeature(tier, "otoole_insights") ? "insights" : "off",
        strategy: "arbitrage",
        budget: 500, maxLoss: 100, maxPositionSize: 50,
        minEdgePct: 0.05, maxHoursToClose: 48, simulationMode: true,
        ...common,
      });
    } else if (preset === "balanced") {
      setOTooleDraft({
        ...otooleDraft,
        mode: hasFeature(tier, "otoole_insights") ? "insights" : "off",
        strategy: "smart-ev",
        budget: 1000, maxLoss: 200, maxPositionSize: 100,
        minEdgePct: 0.04, maxHoursToClose: 0, simulationMode: true,
        ...common,
      });
    } else {
      setOTooleDraft({
        ...otooleDraft,
        mode: eliteOk ? "execution" : hasFeature(tier, "otoole_insights") ? "insights" : "off",
        strategy: "both",
        budget: 5000, maxLoss: 1000, maxPositionSize: 500,
        minEdgePct: 0.025, maxHoursToClose: 0, simulationMode: true,
        ...common,
      });
    }
  }

  function openConfigureSite(siteId: string, marketTitle?: string) {
    setConfigureSiteId(siteId);
    setConfigureIntentMarket(marketTitle ?? null);
    setUsernameDraft(connections[siteId]?.username ?? "");
  }

  function closeConfigureSite() {
    setConfigureSiteId(null);
    setConfigureIntentMarket(null);
    setUsernameDraft("");
  }

  function saveConfiguredUsername() {
    if (!configureSiteId) return;
    const username = usernameDraft.trim() || undefined;
    saveConnection(configureSiteId, username);
    setConnections(loadConnections());
    closeConfigureSite();
  }

  function openSignupForCurrentSite() {
    if (!configureSiteId) return;
    const site = findSite(configureSiteId);
    if (site) window.open(site.signupUrl, "_blank", "noopener,noreferrer");
  }

  function tradeMarket(m: Market) {
    const hasUsername = !!connections[m.platformId]?.username;
    const site = findSite(m.platformId);
    if (hasUsername && site) {
      window.open(site.signupUrl, "_blank", "noopener,noreferrer");
    } else {
      openConfigureSite(m.platformId, m.title);
    }
  }

  function requestGpsLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: LocationState = {
          label: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        saveLocation(loc);
        setLocation(loc);
        setLocModalOpen(false);
      },
      (err) => {
        alert(`Location denied or failed: ${err.message}. Pick a state instead.`);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  function pickState(state: string) {
    const loc: LocationState = { label: state, state };
    saveLocation(loc);
    setLocation(loc);
    setLocModalOpen(false);
  }

  useEffect(() => { document.body.dataset.mode = mode; }, [mode]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  useEffect(() => {
    setClock(clock24());
    const t = setInterval(() => setClock(clock24()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [m, s] = await Promise.all([getMarkets({ limit: 200, sort: "prob" }), getStats()]);
        if (!alive) return;
        setMarkets(m.markets);
        setTotalMarkets(m.totalAcrossPlatforms);
        setStats(s.categories);
      } catch (err) {
        console.error("[otoole] API fetch failed", err);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const i = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(i); };
  }, []);

  /* Poll the scanner. Free sees nothing; Pro has 5s delay; Elite real-time. */
  useEffect(() => {
    let alive = true;
    async function pull() {
      try {
        const res = await getOpportunities({ limit: 20 });
        if (!alive) return;
        setOpps(res.opportunities);
        setOppsFreshAt(res.generatedAt);
      } catch (err) {
        console.error("[edge] opportunities fetch failed", err);
      } finally {
        if (alive) setOppsLoading(false);
      }
    }
    pull();
    const i = setInterval(pull, 5_000);
    return () => { alive = false; clearInterval(i); };
  }, []);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [chat]);
  useEffect(() => {
    if (termMsgsRef.current) termMsgsRef.current.scrollTop = termMsgsRef.current.scrollHeight;
  }, [termChat]);

  const filteredMarkets = useMemo(() => {
    let m = markets;
    if (categoryFilter !== "all") m = m.filter((x) => x.category === categoryFilter);
    if (feedFilter === "trending") {
      m = [...m].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
    } else if (feedFilter === "new") {
      m = [...m].sort((a, b) => a.closeTime - b.closeTime);
    }
    return m;
  }, [markets, categoryFilter, feedFilter]);

  /* Tier-gated opp visibility:
     - Free:  nothing shown (upsell card in place)
     - Pro:   shown w/ 5s delay from when O'Toole found them
     - Elite: real-time */
  const visibleOpps = useMemo(() => {
    if (tier === "free") return [];
    const delayMs = tier === "pro" ? 5000 : 0;
    const cutoff = Date.now() - delayMs;
    return opps.filter((o) => o.discoveredAt <= cutoff).slice(0, 6);
  }, [opps, tier]);
  const arbCount = useMemo(() => visibleOpps.filter((o) => o.kind === "arbitrage").length, [visibleOpps]);
  const valCount = useMemo(() => visibleOpps.filter((o) => o.kind === "value").length, [visibleOpps]);

  const hotMarkets = useMemo(() => {
    if (filteredMarkets.length === 0) return [];
    return [...filteredMarkets]
      .sort((a, b) => {
        const va = a.volume24h ?? 0;
        const vb = b.volume24h ?? 0;
        if (va !== vb) return vb - va;
        return Math.abs(0.5 - a.yesProb) - Math.abs(0.5 - b.yesProb);
      })
      .slice(0, 12);
  }, [filteredMarkets]);

  const topSix = hotMarkets.slice(0, 6);
  const positions: Array<{ title: string; side: "YES" | "NO"; shares: number; pnl: number }> = [
    { title: "Fed Rate Cut June", side: "YES", shares: 200, pnl: 84 },
    { title: "US Recession 2026", side: "NO", shares: 150, pnl: 32 },
    { title: "Bitcoin $150K EOY", side: "YES", shares: 300, pnl: -18 },
    { title: "Nvidia $200 Q3", side: "YES", shares: 100, pnl: 42 },
  ];
  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);

  async function sendChat(msg: string, terminal = false) {
    if (!msg.trim()) return;
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, text: msg, isUser: true, time: nowTime() };
    if (terminal) setTermChat((c) => [...c, userMsg]);
    else setChat((c) => [...c, userMsg]);
    try {
      const reply = await askOToole(msg);
      const aiMsg: ChatMsg = { id: `a-${Date.now()}`, text: reply, isUser: false, time: nowTime() };
      if (terminal) setTermChat((c) => [...c, aiMsg]);
      else setChat((c) => [...c, aiMsg]);
    } catch {
      const errMsg: ChatMsg = { id: `e-${Date.now()}`, text: "Connection to O'Toole failed. Is the API server running?", isUser: false, time: nowTime() };
      if (terminal) setTermChat((c) => [...c, errMsg]);
      else setChat((c) => [...c, errMsg]);
    }
  }

  function handleChipClick(idx: number, label: string) {
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, text: label, isUser: true, time: nowTime() };
    setChat((c) => [...c, userMsg]);
    setTimeout(() => {
      const aiMsg: ChatMsg = { id: `a-${Date.now()}`, text: CHIP_REPLIES[idx] ?? "", isUser: false, time: nowTime() };
      setChat((c) => [...c, aiMsg]);
    }, 600);
  }

  const activeCategories: Array<{ id: CategoryId; code: string }> = [
    { id: "politics",  code: "2024–26" },
    { id: "economics", code: "FED+" },
    { id: "crypto",    code: "DEGEN" },
    { id: "sports",    code: "LIVE" },
  ];

  return (
    <>
      <header className="app-header">
        <div className="h-left">
          <div className="logo">
            <div className="logo-icon">Ø</div>
            <div className="logo-text-wrap">
              <span className="logo-main">O&apos;Toole</span>
              <span className="logo-sub">TERMINAL</span>
            </div>
          </div>
          <div className="h-search">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input type="text" placeholder="Search markets, events, outcomes..." />
          </div>
        </div>
        <div className="h-center">
          <div className="mode-toggle">
            {(["simple", "medium", "terminal"] as Mode[]).map((m) => (
              <button key={m} className={`mode-btn ${mode === m ? "active" : ""}`} onClick={() => tryChangeMode(m)}>
                {m[0].toUpperCase() + m.slice(1)}
                {m === "terminal" && !hasFeature(tier, "view_terminal") && <span style={{ marginLeft: 4, fontSize: 9 }}>🔒</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="h-right">
          <a href="/business" className="biz-chip" title="Enterprise / Terminal license">🏢 For Business ↗</a>
          <div className="live-badge"><span className="live-dot" /> LIVE</div>
          <div className="market-status">
            {loading ? "Loading…" : `${totalMarkets.toLocaleString()} markets`} · <span>{clock}</span> ET
          </div>
          <button className="theme-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
            <svg className="sun-icon" width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <svg className="moon-icon" width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      <div className="filter-bar">
        <div className="filter-cats">
          {FILTER_CATS.map((c) => (
            <button
              key={c.id}
              className={`cat-pill ${categoryFilter === c.id ? "active" : ""}`}
              onClick={() => setCategoryFilter(c.id)}
            >
              <span>{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>
        <div className="filter-divider" />
        <div className="feed-btns">
          <button
            className={`feed-btn new-btn ${feedFilter === "new" ? "active" : ""}`}
            onClick={() => setFeedFilter(feedFilter === "new" ? "all" : "new")}
          >
            <span className="feed-btn-dot" />
            New
          </button>
          <button
            className={`feed-btn trending-btn ${feedFilter === "trending" ? "active" : ""}`}
            onClick={() => setFeedFilter(feedFilter === "trending" ? "all" : "trending")}
          >
            <span className="feed-btn-dot" />
            Trending
          </button>
        </div>
      </div>

      <div className="app-body">
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button
              className={`otoole-enable-btn otoole-mode-${otooleSettings.mode}`}
              onClick={openOTooleSettings}
            >
              <span className="otoole-enable-avatar">Ø</span>
              <span className="otoole-enable-body">
                <span className="otoole-enable-title">Enable O&apos;Toole</span>
                <span className="otoole-enable-sub">
                  {otooleSettings.mode === "off"      && "Disabled · tap to configure"}
                  {otooleSettings.mode === "insights" && "Insights mode · scanning"}
                  {otooleSettings.mode === "execution" && `Executing · $${otooleSettings.budget} budget`}
                </span>
              </span>
              <span className={`otoole-mode-dot ${otooleSettings.mode}`} />
            </button>

            <div className="nav-group">
              <div className="nav-label">Main</div>
              <a className={`nav-item ${view === "dashboard" ? "active" : ""}`} href="#" onClick={(e) => { e.preventDefault(); setView("dashboard"); }}>
                <span className="nav-emoji">📊</span>Dashboard
              </a>
              <a className={`nav-item ${view === "signals" ? "active" : ""}`} href="#" onClick={(e) => { e.preventDefault(); setView("signals"); }}>
                <span className="nav-emoji">⚡</span>Signals
                {tier !== "free" && opps.length > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "var(--green)" }}>
                    {opps.length}
                  </span>
                )}
              </a>
              <a className="nav-item" href="#"><span className="nav-emoji">🏛️</span>Markets</a>
              <a className="nav-item" href="#"><span className="nav-emoji">💼</span>Portfolio</a>
              <a className="nav-item" href="#"><span className="nav-emoji">📅</span>Calendar</a>
              <a className="nav-item" href="#"><span className="nav-emoji">🔥</span>Heatmap</a>
            </div>
            <div className="nav-group">
              <div className="nav-label">Trading</div>
              <a className="nav-item" href="#"><span className="nav-emoji">🔍</span>Scanner</a>
              <a className="nav-item" href="#"><span className="nav-emoji">📖</span>Order Book</a>
              <a className="nav-item" href="#"><span className="nav-emoji">📌</span>Positions</a>
              <a className="nav-item" href="#"><span className="nav-emoji">🕓</span>History</a>
              <a className="nav-item" href="#"><span className="nav-emoji">🎮</span>Simulator</a>
            </div>
            <div className="nav-group">
              <div className="nav-label">O&apos;Toole AI</div>
              <a className="nav-item otoole-nav" href="#"><span className="nav-emoji">💬</span>Chat</a>
              <a className="nav-item" href="#"><span className="nav-emoji">🧠</span>Insights</a>
              <a className="nav-item" href="#"><span className="nav-emoji">⚡</span>Auto-Trade</a>
            </div>
            <div className="nav-group">
              <div className="nav-label">
                Connected Sites
                <span style={{ marginLeft: 6, color: "var(--green)", fontWeight: 700 }}>
                  {Object.values(connections).filter((c) => c?.username).length}/{CONNECTABLE_SITES.length}
                </span>
              </div>
              <div className="connected-sites">
                {(() => {
                  const PINNED = ["kalshi", "polymarket"];
                  const pinnedSites = CONNECTABLE_SITES.filter((s) => PINNED.includes(s.id));
                  const extraConfigured = CONNECTABLE_SITES.filter(
                    (s) => !PINNED.includes(s.id) && connections[s.id]?.username,
                  );
                  const visible = [...pinnedSites, ...extraConfigured];
                  return visible.map((site) => {
                    const isConfigured = !!connections[site.id]?.username;
                    return (
                      <button key={site.id} className="conn-row" onClick={() => openConfigureSite(site.id)}>
                        <span className="conn-emoji">
                          {site.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={site.logoUrl} alt={site.name} width={14} height={14} style={{ borderRadius: 3 }} />
                          ) : site.emoji}
                        </span>
                        <span className="conn-name">{site.name}</span>
                        {isConfigured ? (
                          <span className="conn-status connected"><span className="conn-dot" /></span>
                        ) : (
                          <span className="conn-status disconnected">Configure</span>
                        )}
                      </button>
                    );
                  });
                })()}
                <button
                  className="conn-row see-all-btn"
                  onClick={() => setConfigPlatformsOpen(true)}
                  style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500 }}
                >
                  <span className="conn-emoji">⋯</span>
                  <span className="conn-name">See all {CONNECTABLE_SITES.length} sites</span>
                  <span className="conn-status">→</span>
                </button>
                <button
                  className="conn-row sports-btn"
                  onClick={() => setSportsModalOpen(true)}
                  style={{ marginTop: 4, fontWeight: 600, color: "var(--green)", border: "1px dashed var(--border)" }}
                >
                  <span className="conn-emoji">🏟️</span>
                  <span className="conn-name">Sports (DFS + Books)</span>
                  <span className="conn-status" style={{ color: "var(--green)" }}>
                    {SPORTS_SITES.filter((s) => connections[s.id]?.username).length}/{SPORTS_SITES.length}
                  </span>
                </button>
              </div>
            </div>
            <div className="nav-group">
              <div className="nav-label">Account</div>
              <a
                className="nav-item"
                href="#"
                onClick={(e) => { e.preventDefault(); setWalletModalOpen(true); }}
              >
                <span className="nav-emoji">👛</span>Wallets
                {wallets.length > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "var(--green)" }}>
                    {wallets.length}
                  </span>
                )}
              </a>
              <a
                className="nav-item"
                href="#"
                onClick={(e) => { e.preventDefault(); openSubscriptions(); }}
              >
                <span className="nav-emoji">⚙️</span>Settings
              </a>
            </div>
          </nav>
          <div className="sidebar-footer">
            <button
              className={`location-widget ${location ? "is-set" : ""}`}
              onClick={() => setLocModalOpen(true)}
            >
              <span className="loc-emoji">📍</span>
              <span className="loc-text">
                {location ? location.label : "Set your location"}
              </span>
              <span className="loc-change">{location ? "Change" : "→"}</span>
            </button>
            <div className="sidebar-balance">
              <div className="sb-label">Portfolio Value</div>
              <div className="sb-val">$4,820.00</div>
              <div className="sb-delta up">▲ $620 today</div>
            </div>
            <button
              className={`sub-pill sub-tier-${tier}`}
              onClick={() => openSubscriptions()}
            >
              <span className="sub-pill-emoji">{planFor(tier).emoji}</span>
              <span className="sub-pill-body">
                <span className="sub-pill-title">
                  {planFor(tier).name} · ${calculateMonthly(tier, addons).toFixed(2)}/mo
                </span>
                <span className="sub-pill-sub">
                  {addons.length > 0
                    ? `+ ${addons.length} add-on${addons.length > 1 ? "s" : ""}`
                    : tier === "elite" ? "All features · add-ons available"
                    : tier === "pro"  ? "Upgrade to Elite →"
                    : "Upgrade to Pro →"}
                </span>
              </span>
            </button>
          </div>
        </aside>

        {locModalOpen && (
          <div className="loc-modal-backdrop" onClick={() => setLocModalOpen(false)}>
            <div className="loc-modal" onClick={(e) => e.stopPropagation()}>
              <div className="loc-modal-title">📍 Where are you?</div>
              <div className="loc-modal-sub">
                Prediction market platforms have state-by-state availability. We&apos;ll use your location to show you markets on platforms you can actually access.
              </div>
              <div className="loc-modal-actions">
                <button className="loc-btn primary" onClick={requestGpsLocation}>
                  Use my current location
                </button>
                <select
                  className="loc-select"
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) pickState(e.target.value); }}
                >
                  <option value="" disabled>Or pick a state…</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button className="loc-btn" onClick={() => setLocModalOpen(false)}>
                  Skip for now
                </button>
              </div>
            </div>
          </div>
        )}

        {walletModalOpen && (
          <div className="loc-modal-backdrop" onClick={() => setWalletModalOpen(false)}>
            <div
              className="loc-modal"
              onClick={(e) => e.stopPropagation()}
              style={{ width: 560, maxHeight: "88vh", display: "flex", flexDirection: "column" }}
            >
              <div className="loc-modal-title">👛 Crypto wallets</div>
              <div className="loc-modal-sub">
                Link a wallet to trade on on-chain markets (Polymarket, Limitless, Coinbase Predict). We only store public addresses — no keys, no signing material.
              </div>

              {wallets.length > 0 && (
                <div>
                  <div className="ot-section-label">Connected</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {wallets.map((w) => {
                      const walletMeta = WALLETS.find((x) => x.id === w.provider);
                      const chainMeta = CHAIN_META[w.chainId];
                      return (
                        <div key={`${w.address}-${w.chainId}`} className="wallet-row">
                          <span className="wallet-emoji">{walletMeta?.emoji ?? "👛"}</span>
                          <div className="wallet-body">
                            <div className="wallet-name">
                              {walletMeta?.name ?? w.provider}
                              <span className="wallet-chain" style={{ background: chainMeta.color + "22", color: chainMeta.color }}>
                                {chainMeta.emoji} {chainMeta.name}
                              </span>
                            </div>
                            <div className="wallet-addr">{truncateAddress(w.address)}</div>
                          </div>
                          <button
                            className="wallet-disconnect"
                            onClick={() => disconnectWallet(w)}
                            title="Disconnect"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="ot-section-label">
                  {wallets.length > 0 ? "Add another wallet" : "Connect a wallet"}
                </div>
                <div className="wallet-grid">
                  {WALLETS.map((w) => (
                    <button
                      key={w.id}
                      className="wallet-option"
                      onClick={() => openWalletFlow(w.id)}
                    >
                      <span className="wallet-option-emoji">{w.emoji}</span>
                      <span className="wallet-option-name">{w.name}</span>
                      <span className="wallet-option-chains">
                        {w.chains.map((c) => CHAIN_META[c].emoji).join(" ")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.4, padding: "8px 10px", background: "var(--bg)", borderRadius: 8 }}>
                <strong>Deposit methods (ACH, card, wire) ship next.</strong> For now, crypto-only — fund the wallet you connect through your provider.
              </div>

              <button className="loc-btn" onClick={() => setWalletModalOpen(false)} style={{ justifyContent: "center" }}>
                Close
              </button>
            </div>
          </div>
        )}

        {connectWalletProvider && (() => {
          const meta = WALLETS.find((x) => x.id === connectWalletProvider);
          if (!meta) return null;
          return (
            <div className="loc-modal-backdrop" onClick={closeConnectWallet} style={{ zIndex: 1100 }}>
              <div className="loc-modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
                <div className="loc-modal-title">
                  {meta.emoji} Connect {meta.name}
                </div>
                <div className="loc-modal-sub">
                  Paste your {meta.name} public address below. Later this will open {meta.name} directly and request a read-only signature — no-code demo for now.
                </div>
                <div className="ot-input-wrap">
                  <span className="ot-input-label">Chain</span>
                  <select
                    className="loc-select"
                    value={connectChainDraft}
                    onChange={(e) => setConnectChainDraft(e.target.value as ChainId)}
                  >
                    {meta.chains.map((c) => (
                      <option key={c} value={c}>
                        {CHAIN_META[c].emoji} {CHAIN_META[c].name} — used by {CHAIN_META[c].usedBy.join(", ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ot-input-wrap">
                  <span className="ot-input-label">Public address</span>
                  <input
                    className="loc-select"
                    placeholder={connectChainDraft === "solana" ? "Base58 address" : "0x…"}
                    value={connectAddressDraft}
                    onChange={(e) => { setConnectAddressDraft(e.target.value); setConnectError(null); }}
                    autoFocus
                  />
                  {connectError && (
                    <span style={{ fontSize: 11, color: "var(--red)" }}>{connectError}</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <a
                    href={meta.installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="loc-btn"
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    Install {meta.name} ↗
                  </a>
                  <button className="loc-btn primary" onClick={confirmConnectWallet} style={{ flex: 1 }}>
                    Connect
                  </button>
                </div>
                <button className="loc-btn" onClick={closeConnectWallet} style={{ justifyContent: "center", color: "var(--text-3)" }}>
                  Cancel
                </button>
              </div>
            </div>
          );
        })()}

        {subModalOpen && (
          <div className="loc-modal-backdrop" onClick={() => setSubModalOpen(false)}>
            <div
              className="loc-modal sub-modal"
              onClick={(e) => e.stopPropagation()}
              style={{ width: 820, maxWidth: "94vw", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
            >
              <div className="loc-modal-title">Choose your plan</div>
              {subModalTrigger && (
                <div className="loc-modal-sub" style={{ padding: 10, background: "var(--orange)", color: "white", borderRadius: 8, fontWeight: 600 }}>
                  {subModalTrigger}
                </div>
              )}
              <div className="biz-pricing-toggle" style={{ alignSelf: "flex-start" }}>
                <button
                  className={`biz-toggle-btn ${subPricingView === "individual" ? "active" : ""}`}
                  onClick={() => setSubPricingView("individual")}
                >
                  👤 For individuals
                </button>
                <button
                  className={`biz-toggle-btn ${subPricingView === "business" ? "active" : ""}`}
                  onClick={() => setSubPricingView("business")}
                >
                  🏢 For businesses
                </button>
              </div>

              {subPricingView === "business" && (
                <div style={{ padding: 28, border: "1px solid transparent", borderRadius: 14,
                  background: "linear-gradient(var(--bg), var(--bg)) padding-box, linear-gradient(135deg, #f59e0b, #22c55e, #0ea5e9) border-box",
                  display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>🏢 Enterprise Chair</div>
                      <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>One seat · one human · everything unlocked</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>$25,000</div>
                        <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>setup / chair</div>
                      </div>
                      <span style={{ fontSize: 20, color: "var(--text-3)", fontWeight: 300 }}>+</span>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>$2,000</div>
                        <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>per chair / mo</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.55 }}>
                    Unlimited terminal + REST/WS API · Fast Execution · unrestricted O&apos;Toole · SSO, audit logs, SOC 2 · dedicated customer engineer · on-prem option at 5+ chairs.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <a href="/business" target="_blank" rel="noopener noreferrer" className="loc-btn primary" style={{ flex: 1, justifyContent: "center" }}>
                      See full enterprise pricing →
                    </a>
                    <a href="/business#demo" target="_blank" rel="noopener noreferrer" className="loc-btn" style={{ flex: 1, justifyContent: "center" }}>
                      Request demo
                    </a>
                  </div>
                </div>
              )}

              {subPricingView === "individual" && (
              <>
              <div className="loc-modal-sub">
                Unlock deeper views, O&apos;Toole AI insights, and automated execution. Change or cancel anytime.
              </div>
              <div className="sub-grid">
                {PLANS.map((plan) => {
                  const current = tier === plan.id;
                  return (
                    <div key={plan.id} className={`sub-card sub-card-${plan.id} ${current ? "current" : ""}`}>
                      {current && <div className="sub-ribbon">Current plan</div>}
                      {plan.id === "pro" && !current && <div className="sub-ribbon sub-ribbon-popular">Most popular</div>}
                      <div className="sub-card-head">
                        <span className="sub-card-emoji">{plan.emoji}</span>
                        <div>
                          <div className="sub-card-name">{plan.name}</div>
                          <div className="sub-card-tag">{plan.tagline}</div>
                        </div>
                      </div>
                      <div className="sub-card-price">
                        {plan.priceMonthly === 0 ? (
                          <span className="sub-price-big">Free</span>
                        ) : (
                          <>
                            <span className="sub-price-big">${plan.priceMonthly}</span>
                            <span className="sub-price-period">/mo</span>
                          </>
                        )}
                      </div>
                      <ul className="sub-card-features">
                        {plan.highlights.map((h) => (
                          <li key={h}>{h}</li>
                        ))}
                      </ul>
                      <button
                        className={`loc-btn ${current ? "" : "primary"}`}
                        style={{ justifyContent: "center", marginTop: "auto" }}
                        onClick={() => !current && selectTier(plan.id)}
                        disabled={current}
                      >
                        {current ? "Your plan" : plan.priceMonthly === 0 ? "Downgrade to Free" : `Upgrade to ${plan.name}`}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="ot-section-label" style={{ marginTop: 10 }}>Add-ons</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ADDONS.map((addon) => {
                  const active = addons.includes(addon.id);
                  const eligible = canBuyAddon(tier, addon.id);
                  const baseTierPrice = planFor(tier).priceMonthly;
                  const costLine =
                    addon.pricing.kind === "multiplier"
                      ? baseTierPrice === 0
                        ? `Requires Pro or Elite`
                        : `+$${(baseTierPrice * (addon.pricing.factor - 1)).toFixed(0)}/mo`
                      : `$${addon.pricing.daily.toFixed(2)}/day · ~$${addon.pricing.monthly.toFixed(2)}/mo`;
                  return (
                    <div key={addon.id} className={`addon-row ${active ? "active" : ""} ${!eligible ? "disabled" : ""}`}>
                      <span className="addon-emoji">{addon.emoji}</span>
                      <div className="addon-body">
                        <div className="addon-head">
                          <span className="addon-name">{addon.name}</span>
                          <span className="addon-cost">{costLine}</span>
                        </div>
                        <div className="addon-tag">{addon.tagline}</div>
                        <ul className="addon-details">
                          {addon.details.map((d) => <li key={d}>{d}</li>)}
                        </ul>
                      </div>
                      <div
                        className={`toggle-sw ${active ? "on" : ""}`}
                        onClick={() => eligible && toggleAddon(addon.id)}
                        style={{ opacity: eligible ? 1 : 0.35, cursor: eligible ? "pointer" : "not-allowed", flexShrink: 0 }}
                      >
                        <div className="toggle-knob" />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="sub-total-row">
                <span className="sub-total-label">Your total</span>
                <span className="sub-total-amount">
                  ${calculateMonthly(tier, addons).toFixed(2)}
                  <span className="sub-total-period">/mo</span>
                </span>
              </div>

              <div style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center", marginTop: 4 }}>
                Billing isn&apos;t wired up yet — this is a demo tier switch. Real checkout ships with auth.
              </div>
              </>
              )}
            </div>
          </div>
        )}

        {otooleModalOpen && (
          <div className="loc-modal-backdrop" onClick={() => setOTooleModalOpen(false)}>
            <div
              className="loc-modal otoole-modal"
              onClick={(e) => e.stopPropagation()}
              style={{ width: 520, maxHeight: "86vh", display: "flex", flexDirection: "column" }}
            >
              <div className="loc-modal-title">
                <span className="otoole-enable-avatar" style={{ width: 24, height: 24, fontSize: 12, marginRight: 8, verticalAlign: "middle" }}>Ø</span>
                O&apos;Toole Settings
              </div>
              <div className="loc-modal-sub">
                O&apos;Toole is your AI co-pilot. Pick how involved you want it, then set guardrails if it&apos;s trading on your behalf.
              </div>

              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Quick Start presets */}
                <div>
                  <div className="ot-section-label">Quick Start</div>
                  <div className="ot-preset-row">
                    <button className="ot-preset" onClick={() => applyOTPreset("conservative")}>
                      <span className="ot-preset-emoji">🛡️</span>
                      <span className="ot-preset-title">Conservative</span>
                      <span className="ot-preset-desc">Insights · arb-only · $500 cap · sim on</span>
                    </button>
                    <button className="ot-preset" onClick={() => applyOTPreset("balanced")}>
                      <span className="ot-preset-emoji">⚖️</span>
                      <span className="ot-preset-title">Balanced</span>
                      <span className="ot-preset-desc">Insights · Smart EV · $1k cap · sim on</span>
                    </button>
                    <button className="ot-preset" onClick={() => applyOTPreset("aggressive")}>
                      <span className="ot-preset-emoji">🔥</span>
                      <span className="ot-preset-title">Aggressive</span>
                      <span className="ot-preset-desc">Execution · both · $5k cap · sim on</span>
                      {!hasFeature(tier, "otoole_execution") && <span className="ot-preset-tag">Elite only</span>}
                    </button>
                  </div>
                </div>
                {/* Mode selection */}
                <div>
                  <div className="ot-section-label">Mode <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 500, letterSpacing: 0, textTransform: "none", marginLeft: 6 }}>or fine-tune below</span></div>
                  <div className="ot-mode-grid">
                    {(["off", "insights", "execution"] as OTooleMode[]).map((m) => {
                      const needsElite = m === "execution" && !hasFeature(tier, "otoole_execution");
                      const needsPro   = m === "insights"  && !hasFeature(tier, "otoole_insights");
                      const locked = needsElite || needsPro;
                      return (
                        <button
                          key={m}
                          className={`ot-mode-card ${otooleDraft.mode === m ? "active" : ""} ot-mode-${m} ${locked ? "locked" : ""}`}
                          onClick={() => {
                            if (locked) {
                              openSubscriptions(needsElite ? "O'Toole Execution requires Elite." : "O'Toole Insights requires Pro.");
                              return;
                            }
                            patchDraft("mode", m);
                          }}
                        >
                          <div className="ot-mode-title">{describeMode(m)} {locked && "🔒"}</div>
                          <div className="ot-mode-desc">
                            {m === "off"       && "AI disabled. Pure data view."}
                            {m === "insights"  && "O'Toole surfaces edge and whale activity. Never places trades."}
                            {m === "execution" && "O'Toole places trades via API inside your guardrails."}
                          </div>
                          {needsElite && <div className="ot-badge-pro">ELITE</div>}
                          {needsPro   && <div className="ot-badge-pro" style={{ background: "linear-gradient(135deg,#22c55e,#0ea5e9)" }}>PRO</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {otooleDraft.mode !== "off" && (
                  <div>
                    <div className="ot-section-label">Strategy</div>
                    <div className="ot-strat-row">
                      {(["arbitrage", "smart-ev", "both"] as OTooleStrategy[]).map((s) => (
                        <button
                          key={s}
                          className={`ot-strat-btn ${otooleDraft.strategy === s ? "active" : ""}`}
                          onClick={() => patchDraft("strategy", s)}
                        >
                          {s === "arbitrage" && "Only Arbitrage"}
                          {s === "smart-ev"  && "Smart EV"}
                          {s === "both"      && "Both"}
                        </button>
                      ))}
                    </div>
                    <div className="ot-strat-hint">
                      {otooleDraft.strategy === "arbitrage" && "Only act when the same market trades at different prices on two+ platforms. Lower risk, fewer trades."}
                      {otooleDraft.strategy === "smart-ev"  && "Act on any market where O'Toole estimates positive expected value vs. fair probability."}
                      {otooleDraft.strategy === "both"      && "Arbitrage first, then Smart EV with remaining budget."}
                    </div>
                  </div>
                )}

                {otooleDraft.mode === "execution" && (
                  <>
                    <div>
                      <div className="ot-section-label">Risk guardrails</div>
                      <div className="ot-input-grid">
                        <label className="ot-input-wrap">
                          <span className="ot-input-label">Budget</span>
                          <div className="ot-input-shell">
                            <span className="ot-input-prefix">$</span>
                            <input
                              type="number"
                              className="ot-input"
                              value={otooleDraft.budget}
                              onChange={(e) => patchDraft("budget", Math.max(0, Number(e.target.value) || 0))}
                            />
                          </div>
                          <span className="ot-input-hint">Total capital O&apos;Toole may deploy.</span>
                        </label>
                        <label className="ot-input-wrap">
                          <span className="ot-input-label">Max loss</span>
                          <div className="ot-input-shell">
                            <span className="ot-input-prefix">$</span>
                            <input
                              type="number"
                              className="ot-input"
                              value={otooleDraft.maxLoss}
                              onChange={(e) => patchDraft("maxLoss", Math.max(0, Number(e.target.value) || 0))}
                            />
                          </div>
                          <span className="ot-input-hint">Closes all positions + disables O&apos;Toole when hit.</span>
                        </label>
                        <label className="ot-input-wrap">
                          <span className="ot-input-label">Max position size</span>
                          <div className="ot-input-shell">
                            <span className="ot-input-prefix">$</span>
                            <input
                              type="number"
                              className="ot-input"
                              value={otooleDraft.maxPositionSize}
                              onChange={(e) => patchDraft("maxPositionSize", Math.max(0, Number(e.target.value) || 0))}
                            />
                          </div>
                          <span className="ot-input-hint">Per-trade cap.</span>
                        </label>
                        <label className="ot-input-wrap">
                          <span className="ot-input-label">Min edge</span>
                          <div className="ot-input-shell">
                            <input
                              type="number"
                              step="0.5"
                              className="ot-input"
                              value={(otooleDraft.minEdgePct * 100).toFixed(1)}
                              onChange={(e) => patchDraft("minEdgePct", Math.max(0, (Number(e.target.value) || 0) / 100))}
                            />
                            <span className="ot-input-suffix">%</span>
                          </div>
                          <span className="ot-input-hint">Minimum EV as % of stake to act.</span>
                        </label>
                        <label className="ot-input-wrap">
                          <span className="ot-input-label">Max hours to close</span>
                          <div className="ot-input-shell">
                            <input
                              type="number"
                              className="ot-input"
                              value={otooleDraft.maxHoursToClose}
                              onChange={(e) => patchDraft("maxHoursToClose", Math.max(0, Number(e.target.value) || 0))}
                            />
                            <span className="ot-input-suffix">h</span>
                          </div>
                          <span className="ot-input-hint">0 = no cap. E.g. 48 = only markets resolving in &lt; 2 days.</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <div className="ot-section-label">Platforms authorized</div>
                      <div className="ot-platform-grid">
                        {CONNECTABLE_SITES.map((site) => {
                          const authorized = otooleDraft.platforms.includes(site.id);
                          const configured = !!connections[site.id]?.username;
                          return (
                            <button
                              key={site.id}
                              className={`ot-plat-chip ${authorized ? "on" : ""} ${!configured ? "disabled" : ""}`}
                              onClick={() => configured && toggleDraftPlatform(site.id)}
                              disabled={!configured}
                              title={!configured ? "Configure this site first" : ""}
                            >
                              <span>{site.emoji}</span>
                              <span>{site.name}</span>
                              {!configured && <span className="ot-plat-lock">⚙︎</span>}
                            </button>
                          );
                        })}
                      </div>
                      <div className="ot-strat-hint">Only platforms you&apos;ve configured a username for are selectable.</div>
                    </div>

                    <label className="ot-toggle-row">
                      <div>
                        <div className="ot-toggle-title">Simulation mode</div>
                        <div className="ot-toggle-sub">Log what O&apos;Toole WOULD do, never place real orders. Recommended until you&apos;re confident.</div>
                      </div>
                      <div
                        className={`toggle-sw ${otooleDraft.simulationMode ? "on" : ""}`}
                        onClick={() => patchDraft("simulationMode", !otooleDraft.simulationMode)}
                      >
                        <div className="toggle-knob" />
                      </div>
                    </label>

                    {!otooleDraft.simulationMode && (
                      <div className="ot-warning">
                        ⚠️ Simulation mode is OFF. O&apos;Toole will place real trades up to your budget on the authorized platforms. You can stop it anytime by switching to Insights or Off.
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <button className="loc-btn" onClick={() => setOTooleModalOpen(false)} style={{ flex: 1, justifyContent: "center" }}>
                  Cancel
                </button>
                <button className="loc-btn primary" onClick={saveOTooleDraft} style={{ flex: 2 }}>
                  Save O&apos;Toole settings
                </button>
              </div>
            </div>
          </div>
        )}

        {configPlatformsOpen && (
          <div className="loc-modal-backdrop" onClick={() => setConfigPlatformsOpen(false)}>
            <div
              className="loc-modal"
              onClick={(e) => e.stopPropagation()}
              style={{ width: 480, maxHeight: "86vh", display: "flex", flexDirection: "column" }}
            >
              <div className="loc-modal-title">👛 Configure Platforms</div>
              <div className="loc-modal-sub">
                Connect your accounts so we can deep-link you straight to markets and show a live connected status. Sign up through us and we earn a referral — same price to you.
              </div>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, margin: "0 -4px" }}>
                {CONNECTABLE_SITES.map((site) => {
                  const isConfigured = !!connections[site.id]?.username;
                  return (
                    <button
                      key={site.id}
                      className="conn-row"
                      onClick={() => { setConfigPlatformsOpen(false); openConfigureSite(site.id); }}
                    >
                      <span className="conn-emoji">
                        {site.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={site.logoUrl} alt={site.name} width={14} height={14} style={{ borderRadius: 3 }} />
                        ) : site.emoji}
                      </span>
                      <span className="conn-name">{site.name}</span>
                      {isConfigured ? (
                        <span className="conn-status connected">
                          <span className="conn-dot" />
                          {connections[site.id]?.username ? ` @${connections[site.id]!.username}` : ""}
                        </span>
                      ) : (
                        <span className="conn-status disconnected">Configure</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button className="loc-btn" onClick={() => setConfigPlatformsOpen(false)} style={{ justifyContent: "center" }}>
                Close
              </button>
            </div>
          </div>
        )}

        {sportsModalOpen && (
          <div className="loc-modal-backdrop" onClick={() => setSportsModalOpen(false)}>
            <div
              className="loc-modal"
              onClick={(e) => e.stopPropagation()}
              style={{ width: 440, maxHeight: "82vh", display: "flex", flexDirection: "column" }}
            >
              <div className="loc-modal-title">🏟️ Sports — DFS, Exchanges, Sportsbooks</div>
              <div className="loc-modal-sub">
                Pick the platforms you use. We&apos;ll deep-link you to them when you tap a sports market, and you earn us a commission when you sign up through these links.
              </div>
              <div style={{ flex: 1, overflowY: "auto", margin: "0 -4px", display: "flex", flexDirection: "column", gap: 2 }}>
                {(["exchange", "fantasy", "sportsbook"] as const).map((cat) => {
                  const sites = SPORTS_SITES.filter((s) => s.category === cat);
                  if (sites.length === 0) return null;
                  const catLabel =
                    cat === "exchange" ? "Exchanges"
                    : cat === "fantasy" ? "DFS / Pick'em / Fantasy"
                    : "Sportsbooks";
                  return (
                    <div key={cat}>
                      <div className="nav-label" style={{ padding: "10px 10px 6px" }}>{catLabel}</div>
                      {sites.map((site) => {
                        const isConfigured = !!connections[site.id]?.username;
                        return (
                          <button key={site.id} className="conn-row" onClick={() => { setSportsModalOpen(false); openConfigureSite(site.id); }}>
                            <span className="conn-emoji">
                              {site.logoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={site.logoUrl} alt={site.name} width={14} height={14} style={{ borderRadius: 3 }} />
                              ) : site.emoji}
                            </span>
                            <span className="conn-name">{site.name}</span>
                            {isConfigured ? (
                              <span className="conn-status connected"><span className="conn-dot" /></span>
                            ) : (
                              <span className="conn-status disconnected">Configure</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <button className="loc-btn" onClick={() => setSportsModalOpen(false)} style={{ justifyContent: "center" }}>
                Close
              </button>
            </div>
          </div>
        )}

        {configureSiteId && (() => {
          const site = CONNECTABLE_SITES.find((s) => s.id === configureSiteId);
          if (!site) return null;
          const existing = connections[configureSiteId];
          return (
            <div className="loc-modal-backdrop" onClick={closeConfigureSite}>
              <div className="loc-modal" onClick={(e) => e.stopPropagation()}>
                <div className="loc-modal-title">
                  {site.emoji} Configure {site.name}
                </div>
                {configureIntentMarket && (
                  <div className="loc-modal-sub" style={{ padding: 10, background: "var(--green-dim)", borderRadius: 8, border: "1px solid rgba(34,197,94,0.25)" }}>
                    To trade <strong>“{configureIntentMarket}”</strong> you need a {site.name} account. Sign up (we get a small commission) or enter your existing username below.
                  </div>
                )}
                {!configureIntentMarket && (
                  <div className="loc-modal-sub">
                    Link your {site.name} account so we can show connected status and deep-link you to markets. Don&apos;t have one yet? Sign up through us.
                  </div>
                )}
                <div className="loc-modal-actions">
                  <input
                    className="loc-select"
                    placeholder={`${site.name} username`}
                    value={usernameDraft}
                    onChange={(e) => setUsernameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveConfiguredUsername(); }}
                    autoFocus
                  />
                  <button className="loc-btn primary" onClick={saveConfiguredUsername}>
                    {existing?.username ? "Update username" : "Save username"}
                  </button>
                  <button className="loc-btn" onClick={openSignupForCurrentSite}>
                    Sign up on {site.name} ↗
                  </button>
                  <button className="loc-btn" onClick={closeConfigureSite} style={{ justifyContent: "center", color: "var(--text-3)" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="content-area">
          {view === "signals" && (
            <section className="signals-view">
              <div className="signals-head">
                <div>
                  <div className="signals-title">⚡ Signals</div>
                  <div className="signals-sub">
                    Live opportunities across {Object.keys(opps.reduce<Record<string, 1>>((a, o) => { o.platforms.forEach((p) => (a[p] = 1)); return a; }, {})).length || 0} platforms ·{" "}
                    {tier === "free" ? <span style={{ color: "var(--red)" }}>Free tier — upgrade for real-time feed</span> :
                     tier === "pro"  ? <span style={{ color: "var(--orange)" }}>Pro — 5s delay</span> :
                     <span style={{ color: "var(--green)" }}>Elite — real-time</span>}
                  </div>
                </div>
                <div className="signals-filters">
                  <div className="signals-filter-group">
                    {(["all", "arbitrage", "value"] as const).map((k) => (
                      <button key={k} className={`signals-filter-btn ${signalsKindFilter === k ? "active" : ""}`} onClick={() => setSignalsKindFilter(k)}>
                        {k === "all" ? "All" : k === "arbitrage" ? "Arbitrage" : "Value"}
                      </button>
                    ))}
                  </div>
                  <label className="signals-edge-slider">
                    Min edge: <strong>{(signalsMinEdge / 100).toFixed(1)}%</strong>
                    <input
                      type="range"
                      min="0" max="500" step="25"
                      value={signalsMinEdge}
                      onChange={(e) => setSignalsMinEdge(Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>

              {tier === "free" ? (
                <div className="signals-upsell">
                  <div className="signals-upsell-big">🔒</div>
                  <div className="signals-upsell-title">Signals are a Pro feature.</div>
                  <div className="signals-upsell-body">
                    By the time edges show up on Free, they&apos;re already gone. Pro gets a 5-second feed, Elite sees them in real time.
                  </div>
                  <button className="loc-btn primary" onClick={() => openSubscriptions("Upgrade to access Signals.")}>
                    Upgrade →
                  </button>
                </div>
              ) : (
                <div className="signals-grid">
                  {visibleOpps
                    .filter((o) => signalsKindFilter === "all" || o.kind === signalsKindFilter)
                    .filter((o) => o.edgeBps >= signalsMinEdge)
                    .length === 0 ? (
                    <div className="signals-empty">
                      {oppsLoading ? "Scanning 13,000+ markets…" : "No opportunities match your filters right now. Scanner runs every 5 seconds."}
                    </div>
                  ) : (
                    visibleOpps
                      .filter((o) => signalsKindFilter === "all" || o.kind === signalsKindFilter)
                      .filter((o) => o.edgeBps >= signalsMinEdge)
                      .map((o) => (
                        <div key={o.id} className={`signals-card signals-${o.kind} signals-${o.freshness}`}>
                          <div className="signals-card-head">
                            <span className={`edge-kind-pill edge-${o.kind}`}>{o.kind === "arbitrage" ? "ARBITRAGE" : "VALUE"}</span>
                            <span className="signals-edge">+{(o.edgeBps / 100).toFixed(2)}%</span>
                          </div>
                          <div className="signals-card-title">{o.title}</div>
                          <div className="signals-card-expl">{o.explanation}</div>
                          <div className="signals-legs">
                            {o.legs.map((l, i) => (
                              <div key={l.marketId + i} className="signals-leg">
                                <div className="signals-leg-plat">{l.platformName}</div>
                                <div className="signals-leg-action">
                                  <span className={`signals-leg-side signals-leg-${l.side}`}>{l.action.toUpperCase()} {l.side.toUpperCase()}</span>
                                  <span className="signals-leg-price">{l.priceCents}¢</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          {o.rationale && <div className="signals-rationale">{o.rationale}</div>}
                          <div className="signals-card-foot">
                            <span>Confidence {Math.round(o.confidence * 100)}%</span>
                            <span>
                              Closes in {o.timeToCloseMs > 86400000
                                ? `${Math.round(o.timeToCloseMs / 86400000)}d`
                                : `${Math.round(o.timeToCloseMs / 3600000)}h`}
                            </span>
                            <button className="signals-exec-btn" onClick={() => setOTooleModalOpen(true)}>
                              {hasFeature(tier, "otoole_execution") ? "Execute via O'Toole →" : "Upgrade to execute →"}
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              )}
            </section>
          )}

          {view === "dashboard" && <>
          <section className="mode-section mode-simple">
            <IndexRow stats={stats} categories={activeCategories} />
            <div className="simple-cards-grid">
              {topSix.length === 0 ? (
                <div style={{ padding: 20, color: "var(--text-3)" }}>
                  {loading ? "Loading markets…" : "No markets available. Start the API server."}
                </div>
              ) : (
                topSix.map((m, i) => <SimpleMarketCard key={m.id} market={m} hot={i === 0} onTrade={() => tradeMarket(m)} />)
              )}
            </div>
          </section>

          <section className="mode-section mode-medium">
            <IndexRow stats={stats} categories={activeCategories} />
            <div className="main-grid">
              <div className="widget" style={{ gridArea: "markets" }}>
                <div className="widget-header"><div className="widget-title">Biggest Volume</div></div>
                <div className="widget-body">
                  <div className="mkt-table-head"><span>Market</span><span>YES</span><span>Change</span><span>Vol</span></div>
                  {hotMarkets.slice(0, 6).map((m, i) => (
                    <div key={m.id} className={`mkt-table-row ${i === 0 ? "hot-row" : ""}`} onClick={() => tradeMarket(m)}>
                      <div className="mtr-name">
                        <div className={`mcat-dot ${CATEGORY_META[m.category].dot}`} />
                        <div>
                          <div className="mtr-title" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            {truncate(m.title, 30)}
                            <PlatformBadge platformId={m.platformId} platformName={m.platformName} />
                          </div>
                          <div className="mtr-sub">{m.categoryLabel} · {formatCloseDate(m.closeTime)}</div>
                        </div>
                      </div>
                      <div className={`mtr-yes ${m.yesProb > 0.5 ? "up" : ""}`}>{pct(m.yesProb)}</div>
                      <div className={`mtr-chg ${m.changePct24h && m.changePct24h > 0 ? "up" : "dn"}`}>
                        {formatPct(m.changePct24h)}
                      </div>
                      <div className="mtr-vol">{formatVolume(m.volume24h)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="widget edge-widget" style={{ gridArea: "conf" }}>
                <div className="widget-header">
                  <div className="widget-title">Live Edge</div>
                  <span className="edge-count">
                    {visibleOpps.length > 0 && (
                      <>
                        <span className="edge-count-arb">{arbCount}</span>
                        {" arb · "}
                        <span className="edge-count-val">{valCount}</span>
                        {" val"}
                      </>
                    )}
                  </span>
                </div>
                <div className="widget-body edge-body">
                  {tier === "free" && (
                    <div className="edge-upsell">
                      <div className="edge-upsell-title">🔒 Opportunities are delayed on Free.</div>
                      <div className="edge-upsell-sub">By the time you see them, the edge is gone. <button className="edge-upsell-cta" onClick={() => openSubscriptions("Live Edge needs Pro or Elite.")}>Upgrade →</button></div>
                    </div>
                  )}
                  {visibleOpps.length === 0 && tier !== "free" && (
                    <div style={{ padding: 16, fontSize: 11, color: "var(--text-3)", textAlign: "center" }}>
                      {oppsLoading ? "Scanning…" : "No edges meeting your thresholds right now."}
                    </div>
                  )}
                  {visibleOpps.map((o) => (
                    <button key={o.id} className={`edge-row edge-${o.freshness} edge-${o.kind}`} onClick={() => { /* open opp detail later */ }}>
                      <div className="edge-row-head">
                        <span className={`edge-kind-pill edge-${o.kind}`}>{o.kind === "arbitrage" ? "ARB" : "VAL"}</span>
                        <span className="edge-bps">+{(o.edgeBps / 100).toFixed(1)}%</span>
                      </div>
                      <div className="edge-title">{truncate(o.title, 40)}</div>
                      <div className="edge-legs">
                        {o.legs.map((l, i) => (
                          <span key={l.marketId + i} className={`edge-leg edge-leg-${l.side}`}>
                            {l.platformName} {l.side.toUpperCase()} {l.priceCents}¢
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="widget" style={{ gridArea: "perf" }}>
                <div className="widget-header">
                  <div className="widget-title">Normalized Market Performance</div>
                  <div className="perf-legend">
                    <span className="legend-item"><span className="legend-dot" style={{ background: "#3b82f6" }} />Economics</span>
                    <span className="legend-item"><span className="legend-dot" style={{ background: "#22c55e" }} />Politics</span>
                    <span className="legend-item"><span className="legend-dot" style={{ background: "#ef4444" }} />Crypto</span>
                    <span className="legend-item"><span className="legend-dot" style={{ background: "#f59e0b" }} />Sports</span>
                  </div>
                </div>
                <div className="widget-body chart-body">
                  <div className="chart-y-labels"><span>50%</span><span>30%</span><span>10%</span><span>0%</span></div>
                  <PerfChart />
                </div>
              </div>

              <div className="widget otoole-widget" style={{ gridArea: "otoole" }}>
                <div className="otoole-header">
                  <div className="otoole-identity">
                    <div className="otoole-avatar">Ø</div>
                    <div>
                      <div className="otoole-name">O&apos;Toole</div>
                      <div className="otoole-status"><span className="live-dot" style={{ width: 5, height: 5 }} /> Active · AI Trading</div>
                    </div>
                  </div>
                  <div className="otoole-auto">
                    <span className="auto-label">Auto</span>
                    <div className={`toggle-sw ${autoOn ? "on" : ""}`} onClick={() => setAutoOn((v) => !v)}>
                      <div className="toggle-knob" />
                    </div>
                  </div>
                </div>
                <div className="otoole-chips">
                  <button className="ot-chip" onClick={() => handleChipClick(0, "Find Edge")}>Find Edge</button>
                  <button className="ot-chip" onClick={() => handleChipClick(1, "Whale Alerts")}>Whale Alerts</button>
                  <button className="ot-chip" onClick={() => handleChipClick(2, "Portfolio Risk")}>Portfolio Risk</button>
                  <button className="ot-chip" onClick={() => handleChipClick(3, "Best Bets")}>Best Bets</button>
                </div>
                <div className="otoole-msgs" ref={msgsRef}>
                  {chat.map((m) => (
                    <div key={m.id} className={`ot-msg ${m.isUser ? "ot-user" : "ot-ai"}`}>
                      {!m.isUser && <div className="ot-msg-avatar">Ø</div>}
                      <div className="ot-msg-body">
                        {m.text}
                        <div className="ot-msg-time">{m.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="otoole-input-row">
                  <input
                    type="text"
                    className="otoole-input"
                    placeholder="Ask O'Toole anything..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { sendChat(chatInput); setChatInput(""); }
                    }}
                  />
                  <button className="otoole-send" onClick={() => { sendChat(chatInput); setChatInput(""); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="widget" style={{ gridArea: "cats" }}>
                <div className="widget-header"><div className="widget-title">Category Performance</div><div className="widget-period">1W ▾</div></div>
                <div className="widget-body">
                  {stats.map((s) => {
                    const meta = CATEGORY_META[s.id];
                    const pctVal = s.changePct24h ?? 0;
                    return (
                      <div key={s.id} className="brand-row">
                        <div className="brand-row-name">
                          <div className={`cat-badge ${meta.cls}`}>{meta.mono}</div>
                          <span>{s.label}</span>
                        </div>
                        <div className={`brand-row-pct ${pctVal >= 0 ? "up" : "dn"}`}>
                          {s.changePct24h == null ? `${Math.round(s.avgProb * 100)}%` : formatPct(pctVal)}
                        </div>
                        <div className="brand-bar-wrap">
                          <div className={`brand-bar ${pctVal >= 0 ? "up" : "dn"}`} style={{ width: `${Math.min(100, Math.max(5, s.avgProb * 100))}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="widget" style={{ gridArea: "cal" }}>
                <div className="widget-header">
                  <div className="widget-title">Upcoming Resolutions</div>
                  <select className="widget-select"><option>This Week</option><option>This Month</option></select>
                </div>
                <div className="widget-body">
                  <div className="cal-head"><span>Date</span><span>Market</span><span>YES%</span><span>Impact</span></div>
                  {[...markets]
                    .filter((m) => m.closeTime > Date.now())
                    .sort((a, b) => a.closeTime - b.closeTime)
                    .slice(0, 6)
                    .map((m) => (
                      <div key={m.id} className="cal-row">
                        <span className="cal-time">{formatCloseDate(m.closeTime)}</span>
                        <span className="cal-name">{truncate(m.title, 28)}</span>
                        <span className={`cal-est ${m.yesProb > 0.5 ? "up" : ""}`}>{pct(m.yesProb)}</span>
                        <span className="cal-impact">
                          <div className={`impact-dot ${m.volume24h && m.volume24h > 1_000_000 ? "i-high" : "i-med"}`} />
                          <div className={`impact-dot ${m.volume24h && m.volume24h > 500_000 ? "i-med" : ""}`} />
                          <div className="impact-dot" />
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              <div className="widget" style={{ gridArea: "pos" }}>
                <div className="widget-header"><div className="widget-title">My Positions</div><span className="widget-link">View All ›</span></div>
                <div className="widget-body">
                  {positions.map((p) => (
                    <div key={p.title} className="pos-row">
                      <div className="pos-title">{p.title}</div>
                      <div className={`pos-side ${p.side === "YES" ? "yes-side" : "no-side"}`}>{p.side}</div>
                      <div className="pos-shares">{p.shares} shares</div>
                      <div className={`pos-pnl ${p.pnl >= 0 ? "up" : "dn"}`}>
                        {p.pnl >= 0 ? "+" : ""}${p.pnl}
                      </div>
                    </div>
                  ))}
                  <div className="pos-sep" />
                  <div className="pos-total-row">
                    <span>Total P&amp;L</span>
                    <span className={`pos-pnl ${totalPnl >= 0 ? "up" : "dn"} bold`}>
                      {totalPnl >= 0 ? "+" : ""}${totalPnl}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mode-section mode-terminal">
            <div className="t-stats-bar">
              <div className="t-stat"><span className="t-sl">MARKETS</span><span className="t-sv g">{totalMarkets}</span></div>
              <div className="t-sdiv" />
              <div className="t-stat"><span className="t-sl">PORTFOLIO</span><span className="t-sv g">$4,820</span></div>
              <div className="t-sdiv" />
              <div className="t-stat"><span className="t-sl">24H P&amp;L</span><span className="t-sv g">+$620</span></div>
              <div className="t-sdiv" />
              <div className="t-stat"><span className="t-sl">PLATFORMS</span><span className="t-sv o">2 LIVE</span></div>
              <div className="t-sdiv" />
              <div className="t-stat"><span className="t-sl">POSITIONS</span><span className="t-sv">{positions.length}</span></div>
              <div className="t-sdiv" />
              <div className="t-stat"><span className="t-sl">O&apos;TOOLE</span><span className="t-sv g">ACTIVE</span></div>
            </div>
            <div className="t-layout">
              <div className="t-col">
                <div className="t-panel-head"><span className="t-pt">Hot Markets</span><span className="t-pb">BY VOLUME</span></div>
                <div className="t-drops">
                  {hotMarkets.slice(0, 4).map((m, i) => (
                    <div key={m.id} className={`t-drop ${i === 0 ? "hot" : ""}`} onClick={() => tradeMarket(m)}>
                      <div className="t-drop-brand">{m.categoryLabel} · Closes {formatCloseDate(m.closeTime)}</div>
                      <div className="t-drop-name">{m.title}</div>
                      <div className="t-drop-meta">
                        <div><span className="t-dml">YES Prob</span><span className="t-cd">{pct(m.yesProb)}</span></div>
                        <div><span className="t-dml">24h Change</span><span className={`t-dmv ${m.changePct24h && m.changePct24h >= 0 ? "" : "t-rs"}`}>{formatPct(m.changePct24h)}</span></div>
                        <div><span className="t-dml">Volume</span><span className="t-dmv">{formatVolume(m.volume24h)}</span></div>
                        <div><span className="t-dml">Platform</span><span className="t-dmv">{m.platformName}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="t-col t-col-main">
                <div className="t-panel-head">
                  <span className="t-pt">All Markets</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="t-pb">{totalMarkets} TRACKED</span>
                    <span className="t-chip live"><span className="live-dot small" />LIVE</span>
                  </div>
                </div>
                <div className="t-loading-bar" />
                <div className="t-grid">
                  {hotMarkets.slice(0, 12).map((m) => (
                    <div key={m.id} className="t-gc" onClick={() => tradeMarket(m)}>
                      <div className="t-gc-brand" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        {m.categoryLabel}
                        <PlatformBadge platformId={m.platformId} platformName={m.platformName} />
                      </div>
                      <div className="t-gc-name">{truncate(m.title, 40)}</div>
                      <div className="t-gc-row"><span>YES</span>
                        <span className={`t-chip ${m.yesProb > 0.5 ? "live" : "up"}`}>
                          {m.yesProb > 0.5 && <span className="t-d" />}{pct(m.yesProb)}
                        </span>
                      </div>
                      <div className="t-gc-row"><span>Platform</span><span>{m.platformName}</span></div>
                      <div className="t-gc-foot">
                        <span className="t-ret">NO {100 - m.yesCents}¢</span>
                        <span className="t-slash">/</span>
                        <span className="t-res">YES {m.yesCents}¢</span>
                        <span className={`t-prem ${m.changePct24h && m.changePct24h < 0 ? "red-t" : ""}`}>{formatPct(m.changePct24h)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="t-col t-col-right">
                <div className="t-panel-head">
                  <span className="t-pt otoole-glow">O&apos;Toole AI</span>
                  <span className="t-chip live" style={{ fontSize: 7 }}><span className="live-dot small" />ACTIVE</span>
                </div>
                <div className="t-otoole-msgs" ref={termMsgsRef}>
                  {termChat.map((m) => (
                    <div key={m.id} className={`t-ot-msg ${m.isUser ? "t-ot-user" : ""}`}>
                      {!m.isUser && <div className="t-ot-av">Ø</div>}
                      <div className="t-ot-txt">{m.text}<span className="t-ot-time">{m.time}</span></div>
                    </div>
                  ))}
                </div>
                <div className="t-ot-input-row">
                  <input
                    type="text"
                    className="t-ot-input"
                    placeholder="Ask O'Toole..."
                    value={termInput}
                    onChange={(e) => setTermInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { sendChat(termInput, true); setTermInput(""); }
                    }}
                  />
                  <button className="t-ot-send" onClick={() => { sendChat(termInput, true); setTermInput(""); }}>→</button>
                </div>
                <div className="t-panel-head" style={{ marginTop: 0, borderTop: "1px solid var(--t-border)" }}>
                  <span className="t-pt">My Positions</span><span className="t-pb">{positions.length} OPEN</span>
                </div>
                <div className="t-pos-list">
                  {positions.map((p) => (
                    <div key={p.title} className="t-pos-row">
                      <div className={`t-pos-side ${p.side === "YES" ? "yes" : "no"}`}>{p.side}</div>
                      <div className="t-pos-name">{truncate(p.title, 16)}</div>
                      <div className="t-pos-qty">{p.shares}</div>
                      <div className={`t-pos-pnl ${p.pnl >= 0 ? "g" : "r"}`}>{p.pnl >= 0 ? "+" : ""}${p.pnl}</div>
                    </div>
                  ))}
                </div>
                <TickerBar markets={hotMarkets.slice(0, 6)} />
              </div>
            </div>
          </section>
          </>}
        </div>
      </div>
    </>
  );
}

function IndexRow({ stats, categories }: { stats: CategoryStat[]; categories: Array<{ id: CategoryId; code: string }> }) {
  return (
    <div className="index-row">
      {categories.map(({ id, code }) => {
        const s = stats.find((x) => x.id === id);
        const meta = CATEGORY_META[id];
        const up = (s?.changePct24h ?? 0) >= 0;
        return (
          <div key={id} className="idx-card">
            <div className="idx-left">
              <div className={`idx-cat-icon ${meta.cls}`}>{meta.mono}</div>
              <div className="idx-meta">
                <div className="idx-name">
                  {id.charAt(0).toUpperCase() + id.slice(1)}
                  <span className="idx-code">{code}</span>
                </div>
                <div className="idx-status">{s?.activeMarkets ?? 0} active markets</div>
              </div>
            </div>
            <div className="idx-data">
              <div className="idx-group">
                <div className="idx-label">Avg Prob</div>
                <div className="idx-val">{s ? `${Math.round(s.avgProb * 100)}%` : "—"}</div>
              </div>
              <div className="idx-group">
                <div className="idx-label">24h Vol</div>
                <div className="idx-val">{formatVolume(s?.volume24h ?? null)}</div>
              </div>
              <div className={`idx-change ${up ? "up" : "dn"}`}>
                {s?.changePct24h == null ? "—" : `${up ? "▲" : "▼"} ${Math.abs((s.changePct24h ?? 0) * 100).toFixed(1)}%`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlatformBadge({ platformId, platformName }: { platformId: string; platformName: string }) {
  const meta = PLATFORM_BADGE[platformId];
  const bg = meta?.bg ?? "rgba(100,100,100,0.1)";
  const color = meta?.color ?? "#888";
  return (
    <span className="plat-badge" style={{ background: bg, color }}>
      {meta?.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={meta.logo} alt={platformName} width={10} height={10} style={{ borderRadius: 2, flexShrink: 0 }} />
      ) : null}
      {meta?.short ?? platformName.slice(0, 4).toUpperCase()}
    </span>
  );
}

function SimpleMarketCard({ market, hot, onTrade }: { market: Market; hot?: boolean; onTrade: () => void }) {
  const meta = CATEGORY_META[market.category];
  const yesPct = Math.round(market.yesProb * 100);
  return (
    <div className={`mkt-card ${hot ? "mkt-hot" : ""}`} onClick={onTrade}>
      <div className="mkt-card-top">
        <span className={`mkt-cat ${meta.chip}`}>{market.categoryLabel}</span>
        <PlatformBadge platformId={market.platformId} platformName={market.platformName} />
        <span className={`chip ${market.isLive ? "live" : "upcoming"}`}>
          {market.isLive ? "● LIVE" : "OPEN"}
        </span>
      </div>
      <div className="mkt-title">{truncate(market.title, 80)}</div>
      <div className="mkt-prob-row">
        <div className="mkt-yes-wrap"><div className="mkt-prob yes">{yesPct}%</div><div className="mkt-prob-lbl">YES</div></div>
        <div className="mkt-prob-bar-wrap"><div className="mkt-prob-bar"><div className="mkt-prob-fill" style={{ width: `${yesPct}%` }} /></div></div>
        <div className="mkt-no-wrap"><div className="mkt-prob no">{100 - yesPct}%</div><div className="mkt-prob-lbl">NO</div></div>
      </div>
      <div className="mkt-footer">
        <span className="mkt-vol">{formatVolume(market.volume24h)} vol</span>
        <span className={`mkt-chg ${market.changePct24h && market.changePct24h >= 0 ? "up" : "dn"}`}>
          {formatPct(market.changePct24h)} (24h)
        </span>
        <span className="mkt-exp">Closes {formatCloseDate(market.closeTime)}</span>
      </div>
    </div>
  );
}

function ConfidenceGauge({ score: _score }: { score: number }) {
  return (
    <svg viewBox="0 0 200 120" className="gauge-svg">
      <path d="M20,105 A80,80 0 0,1 180,105" fill="none" stroke="var(--border)" strokeWidth="14" strokeLinecap="round" />
      <path d="M20,105 A80,80 0 0,1 68,33" fill="none" stroke="#ef4444" strokeWidth="14" strokeLinecap="round" opacity="0.5" />
      <path d="M68,33 A80,80 0 0,1 124,25" fill="none" stroke="#f59e0b" strokeWidth="14" strokeLinecap="round" opacity="0.6" />
      <path d="M124,25 A80,80 0 0,1 163,55" fill="none" stroke="#22c55e" strokeWidth="14" strokeLinecap="round" opacity="0.7" />
      <path d="M163,55 A80,80 0 0,1 180,105" fill="none" stroke="#16a34a" strokeWidth="14" strokeLinecap="round" />
      <line x1="100" y1="105" x2="58" y2="40" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="100" cy="105" r="6" fill="var(--text)" />
    </svg>
  );
}

function PerfChart() {
  return (
    <svg viewBox="0 0 460 140" className="perf-chart" preserveAspectRatio="none">
      <line x1="0" y1="28" x2="460" y2="28" stroke="var(--border)" strokeWidth="0.5" />
      <line x1="0" y1="70" x2="460" y2="70" stroke="var(--border)" strokeWidth="0.5" />
      <line x1="0" y1="112" x2="460" y2="112" stroke="var(--border)" strokeWidth="0.5" />
      <path d="M0,110 C50,100 100,85 150,70 S250,40 300,35 S400,15 460,8" fill="none" stroke="#3b82f6" strokeWidth="2" />
      <path d="M0,115 C50,108 100,100 150,88 S250,65 300,58 S400,38 460,22" fill="none" stroke="#22c55e" strokeWidth="2" />
      <path d="M0,108 C50,104 100,110 150,105 S250,100 300,102 S400,108 460,112" fill="none" stroke="#ef4444" strokeWidth="2" />
      <path d="M0,112 C50,105 100,98 150,90 S250,75 300,68 S380,50 460,35" fill="none" stroke="#f59e0b" strokeWidth="2" />
    </svg>
  );
}

function TickerBar({ markets }: { markets: Market[] }) {
  if (markets.length === 0) return <div className="t-ticker"><div className="t-ticker-inner" /></div>;
  const items = [...markets, ...markets];
  return (
    <div className="t-ticker">
      <div className="t-ticker-inner">
        {items.map((m, i) => (
          <span key={`${m.id}-${i}`} className="ti">
            <span className="ti-n">{truncate(m.title, 18)}</span>
            <span className="ti-p">{m.yesCents}¢</span>
            <span className={`ti-c ${m.changePct24h && m.changePct24h >= 0 ? "up" : "dn"}`}>{formatPct(m.changePct24h)}</span>
            {i < items.length - 1 && <span className="ti-s">·</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
