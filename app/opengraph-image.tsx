import { ImageResponse } from "next/og";

export const alt = "HOS AI — An open standard for hotel operations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#fafafa",
        color: "#111",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        padding: "72px",
        position: "relative",
        width: "100%",
      }}
    >
      <div style={{ border: "3px solid #111", display: "flex", height: 88, marginRight: 28, position: "relative", width: 88 }}>
        <div style={{ background: "#111", borderRadius: 99, height: 18, left: -9, position: "absolute", top: 9, width: 18 }} />
        <div style={{ background: "#111", borderRadius: 99, bottom: 9, height: 18, left: -9, position: "absolute", width: 18 }} />
        <div style={{ background: "#0070f3", borderRadius: 99, height: 18, position: "absolute", right: -9, top: 34, width: 18 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ color: "#0070f3", fontSize: 25, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase" }}>HOS AI</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 64, fontWeight: 700, letterSpacing: -3, lineHeight: 1.05, marginTop: 16 }}>
          <span>An open standard</span>
          <span>for hotel operations.</span>
        </div>
      </div>
      <div style={{ bottom: 44, color: "#666", display: "flex", fontSize: 22, left: 72, position: "absolute" }}>
        Open operational specification · Early-stage initiative
      </div>
    </div>,
    size,
  );
}
