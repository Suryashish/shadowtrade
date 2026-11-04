"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createWalletClient, custom, http, isHex, numberToHex, type Address, type EIP1193Provider, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { IS_FORK, monadTestnet, RPC_URL } from "@/lib/config";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

const DEV_KEY = process.env.NEXT_PUBLIC_DEV_WALLET_KEY;
export const DEV_WALLET_AVAILABLE = IS_FORK && !!DEV_KEY && isHex(DEV_KEY);

// An installed browser wallet, discovered through EIP-6963 so every extension
// shows up instead of whichever one won the race for window.ethereum.
export type WalletOption = {
  id: string;
  name: string;
  icon: string | null;
  provider: EIP1193Provider;
};

export type WalletState = {
  wallet: WalletClient | null;
  address: Address | null;
  connecting: boolean;
  error: string | null;
  wallets: WalletOption[];
  pickerOpen: boolean;
  connect: () => Promise<void>;
  connectWith: (id: string) => Promise<void>;
  closePicker: () => void;
  connectDev: () => void;
  disconnect: () => void;
};

type AnnounceEvent = CustomEvent<{ info: { rdns: string; name: string; icon: string }; provider: EIP1193Provider }>;

const LEGACY_ID = "injected";

function useInjectedWallets(): WalletOption[] {
  const [wallets, setWallets] = useState<WalletOption[]>([]);

  useEffect(() => {
    const onAnnounce = (e: Event) => {
      const { info, provider } = (e as AnnounceEvent).detail;
      setWallets((ws) => (ws.some((w) => w.id === info.rdns) ? ws : [...ws.filter((w) => w.id !== LEGACY_ID), { id: info.rdns, name: info.name, icon: info.icon, provider }]));
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Older wallets only inject window.ethereum; offer it if nothing announced.
    const fallback = setTimeout(() => {
      const provider = window.ethereum;
      if (provider) setWallets((ws) => (ws.length ? ws : [{ id: LEGACY_ID, name: "Browser wallet", icon: null, provider }]));
    }, 300);

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      clearTimeout(fallback);
    };
  }, []);

  return wallets;
}

async function ensureMonad(provider: EIP1193Provider) {
  const hex = numberToHex(monadTestnet.id);
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hex,
          chainName: monadTestnet.name,
          nativeCurrency: monadTestnet.nativeCurrency,
          rpcUrls: [RPC_URL],
          blockExplorerUrls: [monadTestnet.blockExplorers.default.url],
        },
      ],
    });
  }
}

// "dev", or "wallet:<id>" for a browser wallet.
const CONNECTION_KEY = "shadowtrade:connection";

function remember(c: string | null) {
  try {
    if (c) localStorage.setItem(CONNECTION_KEY, c);
    else localStorage.removeItem(CONNECTION_KEY);
  } catch {
    // Reconnecting on reload is a convenience only.
  }
}

function recall(): string | null {
  try {
    return localStorage.getItem(CONNECTION_KEY);
  } catch {
    return null;
  }
}

const devWallet = () => createWalletClient({ account: privateKeyToAccount(DEV_KEY as `0x${string}`), chain: monadTestnet, transport: http(RPC_URL) });

export function useWallet(): WalletState {
  const wallets = useInjectedWallets();
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [active, setActive] = useState<EIP1193Provider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const restored = useRef(false);

  const connectWith = useCallback(
    async (id: string) => {
      const option = wallets.find((w) => w.id === id);
      if (!option) return;
      setPickerOpen(false);
      setConnecting(true);
      setError(null);
      try {
        const [address] = (await option.provider.request({ method: "eth_requestAccounts" })) as Address[];
        await ensureMonad(option.provider);
        setWallet(createWalletClient({ account: address, chain: monadTestnet, transport: custom(option.provider) }));
        setActive(option.provider);
        remember(`wallet:${option.id}`);
      } catch (e) {
        setError(e instanceof Error && /reject|denied/i.test(e.message) ? "Connection was cancelled." : `Couldn't connect ${option.name}. Try again.`);
      } finally {
        setConnecting(false);
      }
    },
    [wallets],
  );

  const connect = useCallback(async () => {
    if (wallets.length === 0) {
      setError("No browser wallet found. Install MetaMask or Rabby to continue.");
      return;
    }
    if (wallets.length === 1) return connectWith(wallets[0].id);
    setError(null);
    setPickerOpen(true);
  }, [wallets, connectWith]);

  const connectDev = useCallback(() => {
    if (!DEV_WALLET_AVAILABLE) return;
    setWallet(devWallet());
    setActive(null);
    remember("dev");
  }, []);

  // Reconnect silently after a reload: eth_accounts never opens a wallet popup.
  // Wallets announce asynchronously, so retry until the remembered one appears.
  // Only unmounting cancels: a later announcement must not drop an in-flight restore.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (restored.current) return;
    const last = recall();
    const restore = async () => {
      if (last === "dev" && DEV_WALLET_AVAILABLE) {
        restored.current = true;
        await Promise.resolve();
        if (mounted.current) setWallet(devWallet());
        return;
      }
      const option = last?.startsWith("wallet:") ? wallets.find((w) => `wallet:${w.id}` === last) : undefined;
      if (!option) return;
      restored.current = true;
      const { provider } = option;
      const [address] = ((await provider.request({ method: "eth_accounts" }).catch(() => [])) as Address[]) ?? [];
      const chainId = (await provider.request({ method: "eth_chainId" }).catch(() => null)) as string | null;
      if (mounted.current && address && chainId && Number(chainId) === monadTestnet.id) {
        setWallet(createWalletClient({ account: address, chain: monadTestnet, transport: custom(provider) }));
        setActive(provider);
      }
    };
    restore();
  }, [wallets]);

  useEffect(() => {
    if (!active?.on) return;
    const reset = () => setWallet(null);
    active.on("accountsChanged", reset);
    active.on("chainChanged", reset);
    return () => {
      active.removeListener?.("accountsChanged", reset);
      active.removeListener?.("chainChanged", reset);
    };
  }, [active]);

  return {
    wallet,
    address: wallet?.account?.address ?? null,
    connecting,
    error,
    wallets,
    pickerOpen,
    connect,
    connectWith,
    closePicker: () => setPickerOpen(false),
    connectDev,
    disconnect: () => {
      remember(null);
      setWallet(null);
      setActive(null);
    },
  };
}
