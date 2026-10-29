import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 画像最適化(/_next/image)は未使用のため止め、sharp への入力経路を断つ
  images: { unoptimized: true },
};

export default nextConfig;
