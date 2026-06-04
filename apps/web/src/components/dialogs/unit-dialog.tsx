"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { api, ApiClientError } from "@/lib/api-client"
import { type Site, type Unit } from "@/lib/mock-data"
import { Copy, Check } from "lucide-react"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  unit?: Unit | null
  onSuccess: () => void
}

export function UnitDialog({ open, onOpenChange, unit, onSuccess }: Props) {
  const isEdit = !!unit
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [sites, setSites] = useState<Site[]>([])
  const [deviceToken, setDeviceToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [siteId, setSiteId] = useState("")
  const [unitName, setUnitName] = useState("")
  const [pcUuid, setPcUuid] = useState("")
  const [connectionMode, setConnectionMode] = useState("online")

  useEffect(() => {
    if (open) {
      setSiteId(unit?.siteId ?? "")
      setUnitName(unit?.unitName ?? "")
      setPcUuid(unit?.pcUuid ?? "")
      setConnectionMode(unit?.connectionMode ?? "online")
      setError("")
      setDeviceToken(null)
      setCopied(false)
      void api.getSites({ limit: 100 })
        .then((data) => setSites(data.items))
        .catch((err) => {
          setSites([])
          setError(err instanceof ApiClientError ? err.message : "拠点一覧の取得に失敗しました")
        })
    }
  }, [open, unit])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      if (isEdit) {
        await api.updateUnit(unit!.unitId, {
          siteId: siteId || undefined,
          unitName,
          pcUuid: pcUuid || undefined,
          connectionMode: connectionMode as "online" | "offline",
        })
        onOpenChange(false)
        onSuccess()
      } else {
        const result = await api.createUnit({
          siteId,
          unitName,
          pcUuid: pcUuid || undefined,
          connectionMode,
        })
        if (result.deviceToken) {
          setDeviceToken(result.deviceToken)
        } else {
          onOpenChange(false)
          onSuccess()
        }
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "エラーが発生しました")
    } finally {
      setIsLoading(false)
    }
  }

  function handleCopy() {
    if (deviceToken) {
      navigator.clipboard.writeText(deviceToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (deviceToken) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>筐体が作成されました</DialogTitle>
            <DialogDescription>
              以下のデバイストークンを筐体端末に設定してください。このトークンは再表示できません。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-[oklch(0.7_0.15_60)]/30 bg-[oklch(0.7_0.15_60)]/5 p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">デバイストークン</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-muted p-2 font-mono text-sm">
                {deviceToken}
              </code>
              <Button variant="outline" size="icon-sm" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-chart-2" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { onOpenChange(false); onSuccess() }}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "筐体を編集" : "筐体を追加"}</DialogTitle>
          <DialogDescription>
            {isEdit ? `${unit!.unitId} の情報を編集します` : "新しい筐体を登録します"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="unit-site">所属拠点 *</Label>
            <select
              id="unit-site"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">拠点を選択</option>
              {sites.map((s) => (
                <option key={s.siteId} value={s.siteId}>
                  {s.siteName}（{s.siteId}）
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit-name">筐体名 *</Label>
            <Input
              id="unit-name"
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
              required
              placeholder="例: 渋谷1号機"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit-uuid">PC UUID</Label>
            <Input
              id="unit-uuid"
              value={pcUuid}
              onChange={(e) => setPcUuid(e.target.value)}
              placeholder="例: 550e8400-e29b-41d4-a716-446655440000"
            />
          </div>
          <div className="space-y-2">
            <Label>接続モード</Label>
            <div className="flex gap-2">
              {["online", "offline"].map((mode) => (
                <Badge
                  key={mode}
                  variant={connectionMode === mode ? "default" : "outline"}
                  className="cursor-pointer px-4 py-1.5"
                  onClick={() => setConnectionMode(mode)}
                >
                  {mode === "online" ? "オンライン" : "オフライン"}
                </Badge>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "保存中..." : isEdit ? "更新する" : "追加する"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
