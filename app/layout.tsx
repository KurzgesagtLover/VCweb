import type { Metadata } from "next";
import localFont from "next/font/local";
import { BackgroundOst } from "@/src/ui/background-ost";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

const anemoneAir = localFont({
  src: "../Cafe24OhsquareAir-v2.0.otf",
  variable: "--font-anemone-air",
  display: "swap",
  weight: "400",
});

const scoreDream = localFont({
  src: "../SCDream2.otf",
  variable: "--font-score-dream",
  display: "swap",
  weight: "200",
});

export const metadata: Metadata = {
  title: { default: "NEXUS — 가상국가 모의전", template: "%s | NEXUS" },
  description: "정책, 경제, 정치, 연구를 턴 단위로 운영하는 가상국가 모의전 플랫폼",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${anemoneAir.variable} ${scoreDream.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">
          본문으로 건너뛰기
        </a>
        <BackgroundOst />
        {children}
      </body>
    </html>
  );
}
