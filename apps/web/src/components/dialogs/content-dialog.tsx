"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api, ApiClientError } from "@/lib/api-client"
import type { Content } from "@/lib/mock-data"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  content?: Content | null
  onSuccess: () => void
}

export function ContentDialog({ open, onOpenChange, content, onSuccess }: Props) {
  const isEdit = !!content
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const [contentName, setContentName] = useState("")
  const [language, setLanguage] = useState("ja")
  const [deliveryType, setDeliveryType] = useState("general")
  const [statusCategory, setStatusCategory] = useState("status1")

  useEffect(() => {
    if (open) {
      setContentName(content?.contentName ?? "")
      setLanguage(content?.language ?? "ja")
      setDeliveryType(content?.deliveryType ?? "general")
      setStatusCategory(content?.statusCategory ?? "status1")
      setError("")
    }
  }, [open, content])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const data = { contentName, language, deliveryType, statusCategory }
      if (isEdit) {
        await api.updateContent(content!.contentId, data)
      } else {
        await api.createContent(data)
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
          <DialogTitle>{isEdit ? "コンテンツを編集" : "コンテンツを追加"}</DialogTitle>
          <DialogDescription>
            {isEdit ? `${content!.contentId} の情報を編集します` : "新しいコンテンツを登録します"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="content-name">コンテンツ名 *</Label>
            <Input
              id="content-name"
              value={contentName}
              onChange={(e) => setContentName(e.target.value)}
              required
              placeholder="例: リラクゼーション映像 Vol.2"
            />
          </div>
          <div className="space-y-2">
            <Label>言語</Label>
            <div className="flex gap-2">
              {[
                { value: "ja", label: "日本語" },
                { value: "en", label: "English" },
                { value: "zh", label: "中文" },
                { value: "ko", label: "한국어" },
              ].map((lang) => (
                <Badge
                  key={lang.value}
                  variant={language === lang.value ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1.5"
                  onClick={() => setLanguage(lang.value)}
                >
                  {lang.label}
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>配信区分</Label>
            <div className="flex gap-2">
              {[
                { value: "general", label: "一般配信" },
                { value: "limited", label: "限定配信" },
              ].map((dt) => (
                <Badge
                  key={dt.value}
                  variant={deliveryType === dt.value ? "default" : "outline"}
                  className="cursor-pointer px-4 py-1.5"
                  onClick={() => setDeliveryType(dt.value)}
                >
                  {dt.label}
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>状態カテゴリ</Label>
            <div className="flex gap-2">
              {["status1", "status2", "status3"].map((sc) => (
                <Badge
                  key={sc}
                  variant={statusCategory === sc ? "default" : "outline"}
                  className="cursor-pointer px-4 py-1.5"
                  onClick={() => setStatusCategory(sc)}
                >
                  {sc}
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
