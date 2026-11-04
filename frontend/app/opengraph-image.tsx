import { ImageResponse } from "next/og";

export const alt = "ShadowTrade — Private trading on Monad";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#ffffff",
          color: "#000000",
          border: "1px solid #000000",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <svg width="56" height="56" viewBox="0 0 32 32">
              <rect width="32" height="32" fill="#0000F5" />
              <path d="M11.5 9.5v15" stroke="#fff" strokeOpacity=".42" strokeWidth="1.6" />
              <rect x="8.5" y="12.5" width="6" height="9" fill="#fff" fillOpacity=".42" />
              <path d="M20.5 6v19" stroke="#fff" strokeWidth="1.6" />
              <rect x="17.5" y="9" width="6" height="12" fill="#fff" />
            </svg>
            <div style={{ display: "flex", marginLeft: 18, fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>
              <span>Shadow</span>
              <span style={{ color: "#969696" }}>Trade</span>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 20, letterSpacing: 2, color: "#444444", textTransform: "uppercase" }}>
            Monad testnet
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 112, fontWeight: 800, letterSpacing: -6, lineHeight: 1.0 }}>
            Trade without
          </div>
          <div style={{ display: "flex", fontSize: 112, fontWeight: 800, letterSpacing: -6, lineHeight: 1.0 }}>
            being&nbsp;<span style={{ color: "#0000F5" }}>watched.</span>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#444444", letterSpacing: 1, textTransform: "uppercase" }}>
          Private perps and spot on Monad / Seconds, not hours
        </div>
      </div>
    ),
    { ...size },
  );
}
