"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Droplets } from "lucide-react"
import { setTokens } from "@/lib/api-client"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api"

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const body = await res.json()

      if (!res.ok || body.result === "ng") {
        setError(body.message ?? "ログインに失敗しました")
        return
      }

      setTokens(body.data.access_token, body.data.refresh_token)
      localStorage.setItem("sinmirai_admin", JSON.stringify(body.data.admin))

      router.push("/")
    } catch {
      setError("サーバーに接続できませんでした")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[oklch(0.17_0.04_250)] via-[oklch(0.13_0.05_260)] to-[oklch(0.10_0.03_240)]">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 h-[600px] w-[600px] rounded-full bg-[oklch(0.25_0.08_180)] opacity-20 blur-[120px]" />
        <div className="absolute -right-1/4 -bottom-1/4 h-[500px] w-[500px] rounded-full bg-[oklch(0.25_0.1_250)] opacity-15 blur-[100px]" />
      </div>

      <Card className="relative z-10 w-full max-w-md border-[oklch(0.28_0.04_250)] bg-[oklch(0.14_0.025_250)]/90 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <CardHeader className="items-center gap-3 pb-2 pt-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[oklch(0.6_0.15_180)] to-[oklch(0.5_0.12_200)] shadow-lg shadow-[oklch(0.5_0.12_180)]/25">
            <Droplets className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-white">
              シン・ミライ人間洗濯機
            </h1>
            <p className="mt-1 text-sm text-[oklch(0.6_0.01_240)]">
              管理コンソール
            </p>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-8 pt-4">
          <form
            id="sinmirai-login-form"
            data-form-id="sinmirai-login"
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="sinmirai-email"
                className="text-xs font-medium uppercase tracking-wider text-[oklch(0.55_0.01_240)]"
              >
                メールアドレス
              </label>
              <Input
                id="sinmirai-email"
                name="sinmirai-email"
                type="email"
                autoComplete="username"
                required
                placeholder="mail@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 border-[oklch(0.28_0.03_250)] bg-[oklch(0.1_0.02_250)] text-white placeholder:text-[oklch(0.4_0.01_240)] focus-visible:ring-[oklch(0.6_0.15_180)]"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="sinmirai-password"
                className="text-xs font-medium uppercase tracking-wider text-[oklch(0.55_0.01_240)]"
              >
                パスワード
              </label>
              <div className="relative">
                <Input
                  id="sinmirai-password"
                  name="sinmirai-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="パスワードを入力"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 border-[oklch(0.28_0.03_250)] bg-[oklch(0.1_0.02_250)] pr-11 text-white placeholder:text-[oklch(0.4_0.01_240)] focus-visible:ring-[oklch(0.6_0.15_180)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[oklch(0.5_0.01_240)] transition-colors hover:text-white"
                  aria-label={showPassword ? "パスワードを非表示" : "パスワードを表示"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="h-11 w-full bg-gradient-to-r from-[oklch(0.55_0.15_180)] to-[oklch(0.45_0.12_200)] font-semibold text-white shadow-lg shadow-[oklch(0.5_0.12_180)]/20 transition-all hover:from-[oklch(0.6_0.15_180)] hover:to-[oklch(0.5_0.12_200)] hover:shadow-xl"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  認証中...
                </span>
              ) : (
                "ログイン"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
