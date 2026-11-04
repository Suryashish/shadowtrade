"use client";

import { useCallback, useEffect, useState } from "react";
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

export type WalletState = {
  wallet: WalletClient | null;
  address: Address | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
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

export function useWallet(): WalletState {
  const [wallet, setWallet] = useState<WalletClient | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) {
      setError("No browser wallet found. Install MetaMask or Rabby to continue.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const [address] = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
      await ensureMonad(provider);
      setWallet(createWalletClient({ account: address, chain: monadTestnet, transport: custom(provider) }));
    } catch (e) {
      setError(e instanceof Error && /reject|denied/i.test(e.message) ? "Connection was cancelled." : "Couldn't connect your wallet. Try again.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectDev = useCallback(() => {
    if (!DEV_WALLET_AVAILABLE) return;
    const account = privateKeyToAccount(DEV_KEY as `0x${string}`);
    setWallet(createWalletClient({ account, chain: monadTestnet, transport: http(RPC_URL) }));
  }, []);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider?.on) return;
    const reset = () => setWallet(null);
    provider.on("accountsChanged", reset);
    provider.on("chainChanged", reset);
    return () => {
      provider.removeListener?.("accountsChanged", reset);
      provider.removeListener?.("chainChanged", reset);
    };
  }, []);

  return {
    wallet,
    address: wallet?.account?.address ?? null,
    connecting,
    error,
    connect,
    connectDev,
    disconnect: () => setWallet(null),
  };
}
