import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/web3/Providers";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

const fontSans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const fontMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "ForgeCapita — Web3 Milestone-Gated Crowdfunding",
  description:
    "ForgeCapita is a decentralized crowdfunding platform where investors fund startups milestone by milestone on Arbitrum Sepolia and BSC Testnet. Invest, vote on milestones, and trade tokens on the P2P market.",
  keywords: ["web3", "crowdfunding", "ethereum", "defi", "startup", "milestone"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable}`}>
      <body>
        <Providers>
          {/* No global glow: pages that want one use .hero-glow (one per page). */}
          <div className="page-wrapper">
            <AppShell>{children}</AppShell>
          </div>
        </Providers>
      </body>
    </html>
  );
}
