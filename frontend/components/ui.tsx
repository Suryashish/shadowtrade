"use client";

import { useState } from "react";
import { EXPLORER } from "@/lib/config";
import { shortAddress } from "@/lib/format";

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <span aria-hidden className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />;
}

export function Address({ address, explorer = true }: { address: string; explorer?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[13px]">
      <span>{shortAddress(address)}</span>
      <button onClick={copy} aria-label="Copy address" className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-surface-2 hover:text-text">
        {copied ? "Copied" : "Copy"}
      </button>
      {explorer && (
        <a
          href={`${EXPLORER}/address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
        >
          Explorer ↗
        </a>
      )}
    </span>
  );
}
