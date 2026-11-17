export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid rgba(255,255,255,0.07)",
        padding: "24px",
        textAlign: "center",
        fontSize: "13px",
        color: "rgba(241,245,249,0.5)",
      }}
    >
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: "#a78bfa", marginBottom: "4px" }}>
        ForgeCapita
      </div>
      <div>Running on Arbitrum Sepolia and BSC Testnet. Testnet funds only, no real value.</div>
      <div style={{ marginTop: "4px" }}>Copyright ForgeCapita. All rights reserved.</div>
    </footer>
  );
}
