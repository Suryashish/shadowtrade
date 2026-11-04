/** The ShadowTrade mark: a candle and the offset shadow it casts. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="3" className="fill-accent" />
      {/* shadow candle */}
      <path d="M11.5 9.5v15" stroke="#fff" strokeOpacity=".42" strokeWidth="1.6" strokeLinecap="square" />
      <rect x="8.5" y="12.5" width="6" height="9" fill="#fff" fillOpacity=".42" />
      {/* lit candle */}
      <path d="M20.5 6v19" stroke="#fff" strokeWidth="1.6" strokeLinecap="square" />
      <rect x="17.5" y="9" width="6" height="12" fill="#fff" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-[15px] font-bold tracking-[-0.02em]">
        Shadow<span className="text-muted">Trade</span>
      </span>
    </span>
  );
}
