import type { Metadata } from "next"
import { DM_Sans, Noto_Sans_JP, JetBrains_Mono } from "next/font/google"
import { Providers } from "./providers"
import "./globals.css"

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
})

export const metadata: Metadata = {
  title: "シン・ミライ人間洗濯機 管理画面",
  description: "拠点・筐体・コンテンツの一元管理システム",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ja"
      className={`${dmSans.variable} ${notoSansJP.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
