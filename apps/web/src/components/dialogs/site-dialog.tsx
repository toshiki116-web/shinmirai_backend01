"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api, ApiClientError } from "@/lib/api-client"
import type { Site } from "@/lib/mock-data"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  site?: Site | null
  onSuccess: () => void
}

export function SiteDialog({ open, onOpenChange, site, onSuccess }: Props) {
  const isEdit = !!site
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const [siteName, setSiteName] = useState("")
  const [address, setAddress] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [note, setNote] = useState("")

  useEffect(() => {
    if (open) {
      setSiteName(site?.siteName ?? "")
      setAddress(site?.address ?? "")
      setPhoneNumber(site?.phoneNumber ?? "")
      setNote(site?.note ?? "")
      setError("")
    }
  }, [open, site])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const data = {
        siteName,
        address: address || undefined,
        phoneNumber: phoneNumber || undefined,
        note: note || undefined,
      }
      if (isEdit) {
        await api.updateSite(site!.siteId, data)
      } else {
        await api.createSite(data)
      }
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "エラーが発生しました")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "拠点を編集" : "拠点を追加"}</DialogTitle>
          <DialogDescription>
            {isEdit ? `${site!.siteId} の情報を編集します` : "新しい拠点を登録します"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="site-name">拠点名 *</Label>
            <Input
              id="site-name"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              required
              placeholder="例: 渋谷スクランブルスクエア店"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-address">住所</Label>
            <Input
              id="site-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="例: 東京都渋谷区渋谷2-24-12"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-phone">電話番号</Label>
            <Input
              id="site-phone"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="例: 03-1234-5678"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-note">備考</Label>
            <Textarea
              id="site-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="メモ・特記事項"
              rows={3}
            />
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
