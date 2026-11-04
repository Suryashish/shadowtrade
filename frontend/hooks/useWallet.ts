"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createWalletClient, custom, http, isHex, numberToHex, type Address, type EIP1193Provider, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { IS_FORK, monadTestnet, RPC_URL } from "@/lib/config";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<WalletOption>;
  }
}

const DEV_KEY = process.env.NEXT_PUBLIC_DEV_WALLET_KEY;
export const DEV_WALLET_AVAILABLE = IS_FORK && !!DEV_KEY && isHex(DEV_KEY);

// EIP-6963: every installed wallet announces itself, so users can pick one
// instead of getting whichever extension won the race for window.ethereum.
export type WalletOption = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: EIP1193Provider;
};

const LEGACY_RDNS = "injected";

export type WalletState = {
  wallet: WalletClient | null;
  address: Address | null;
  connecting: boolean;
  error: string | null;
  /** Wallets detected in this browser. */
  options: WalletOption[];
  /** Whether the wallet picker is open. */
  picking: boolean;
  connect: () => void;
  connectWith: (rdns: string) => Promise<void>;
  closePicker: () => void;
  connectDev: () => void;
  disconnect: () => void;
};

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

const CONNECTION_KEY = "shadowtrade:connection";
// "dev", or the rdns of the injected wallet that was used.
type Connection = string;

function remember(c: Connection | null) {
  try {
    if (c) localStorage.setItem(CONNECTION_KEY, c);
    else localStorage.removeItem(CONNECTION_KEY);
  } catch {
    // Reconnecting on reload is a convenience only.
  }
}

function recall(): Connection | null {
  try {
    return localStorage.getItem(CONNECTION_KEY);
  } catch {
    return null;
  }
}

const devWallet = () => createWalletClient({ account: privateKeyToAccount(DEV_KEY as `0x${string}`), chain: monadTestnet, transport: http(RPC_URL) });

function useWalletOptions(): WalletOption[] {
  const [options, setOptions] = useState<WalletOption[]>([]);

  useEffect(() => {
    const announced = new Map<string, WalletOption>();
    const publish = () => {
      const list = [...announced.values()];
      // Older wallets that only inject window.ethereum still get a row.
      if (!list.length && window.ethereum) {
        list.push({ info: { uuid: LEGACY_RDNS, name: "Browser wallet", icon: "", rdns: LEGACY_RDNS }, provider: window.ethereum });
      }
      setOptions(list);
    };
    const onAnnounce = (e: CustomEvent<WalletOption>) => {
      announced.set(e.detail.info.rdns, e.detail);
      publish();
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    publish();
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);

  return options;
}

export function useWallet(): WalletState {
  const options = useWalletOptions();
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    setError(null);
    if (!options.length) {
      setError("No browser wallet found. Install MetaMask or Rabby to continue.");
      return;
    }
    setPicking(true);
  }, [options.length]);

  const connectWith = useCallback(
    async (rdns: string) => {
      const option = options.find((o) => o.info.rdns === rdns);
      if (!option) return;
      setPicking(false);
      setConnecting(true);
      setError(null);
      try {
        const [address] = (await option.provider.request({ method: "eth_requestAccounts" })) as Address[];
        await ensureMonad(option.provider);
        setWallet(createWalletClient({ account: address, chain: monadTestnet, transport: custom(option.provider) }));
        setProvider(option.provider);
        remember(rdns);
      } catch (e) {
        setError(e instanceof Error && /reject|denied/i.test(e.message) ? "Connection was cancelled." : `Couldn't connect ${option.info.name}. Try again.`);
      } finally {
        setConnecting(false);
      }
    },
    [options],
  );

  const connectDev = useCallback(() => {
    if (!DEV_WALLET_AVAILABLE) return;
    setPicking(false);
    setWallet(devWallet());
    setProvider(null);
    remember("dev");
  }, []);

  // Reconnect silently after a reload: eth_accounts never opens a wallet popup.
  // Wallets announce asynchronously, so wait until the remembered one shows up.
  const restored = useRef(false);
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
    if (!last) {
      restored.current = true;
      return;
    }
    if (last === "dev") {
      restored.current = true;
      if (DEV_WALLET_AVAILABLE) Promise.resolve().then(() => mounted.current && setWallet(devWallet()));
      return;
    }
    const option = options.find((o) => o.info.rdns === last);
    if (!option) return;
    restored.current = true;
    const restore = async () => {
      const [address] = ((await option.provider.request({ method: "eth_accounts" }).catch(() => [])) as Address[]) ?? [];
      const chainId = (await option.provider.request({ method: "eth_chainId" }).catch(() => null)) as string | null;
      if (mounted.current && address && chainId && Number(chainId) === monadTestnet.id) {
        setWallet(createWalletClient({ account: address, chain: monadTestnet, transport: custom(option.provider) }));
        setProvider(option.provider);
      }
    };
    restore();
  }, [options]);

  useEffect(() => {
    if (!provider?.on) return;
    const reset = () => setWallet(null);
    provider.on("accountsChanged", reset);
    provider.on("chainChanged", reset);
    return () => {
      provider.removeListener?.("accountsChanged", reset);
      provider.removeListener?.("chainChanged", reset);
    };
  }, [provider]);

  return {
    wallet,
    address: wallet?.account?.address ?? null,
    connecting,
    error,
    options,
    picking,
    connect,
    connectWith,
    closePicker: () => setPicking(false),
    connectDev,
    disconnect: () => {
      remember(null);
      setWallet(null);
      setProvider(null);
    },
  };
}
