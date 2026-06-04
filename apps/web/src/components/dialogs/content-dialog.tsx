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
import type { Content, Site } from "@/lib/mock-data"

type ContentWithAssignedSites = Content & {
  assignedSites?: { siteId: string; siteName: string }[]
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  content?: ContentWithAssignedSites | null
  onSuccess: () => void
}

export function ContentDialog({ open, onOpenChange, content, onSuccess }: Props) {
  const isEdit = !!content
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [sites, setSites] = useState<Site[]>([])

  const [contentName, setContentName] = useState("")
  const [language, setLanguage] = useState("ja")
  const [deliveryType, setDeliveryType] = useState("general")
  const [statusCategory, setStatusCategory] = useState("status1")
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setContentName(content?.contentName ?? "")
      setLanguage(content?.language ?? "ja")
      setDeliveryType(content?.deliveryType ?? "general")
      setStatusCategory(content?.statusCategory ?? "status1")
      setSelectedSiteIds(content?.assignedSites?.map((site) => site.siteId) ?? [])
      setError("")
      void api.getSites({ limit: 100 })
        .then((data) => setSites(data.items))
        .catch((err) => {
          setSites([])
          setError(err instanceof ApiClientError ? err.message : "拠点一覧の取得に失敗しました")
        })
    }
  }, [open, content])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (deliveryType === "limited" && selectedSiteIds.length === 0) {
      setError("限定配信では配信先拠点を1件以上選択してください")
      return
    }
    setIsLoading(true)

    try {
      const data = {
        contentName,
        language,
        deliveryType,
        statusCategory,
        siteIds: deliveryType === "limited" ? selectedSiteIds : [],
      }
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

  function toggleSite(siteId: string) {
    setSelectedSiteIds((current) =>
      current.includes(siteId)
        ? current.filter((id) => id !== siteId)
        : [...current, siteId],
    )
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
          {deliveryType === "limited" && (
            <div className="space-y-2">
              <Label>配信先拠点 *</Label>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-input p-3">
                {sites.length === 0 ? (
                  <p className="text-sm text-muted-foreground">拠点がありません</p>
                ) : (
                  sites.map((site) => (
                    <label key={site.siteId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedSiteIds.includes(site.siteId)}
                        onChange={() => toggleSite(site.siteId)}
                        className="h-4 w-4"
                      />
                      <span>{site.siteName}</span>
                      <span className="font-mono text-xs text-muted-foreground">{site.siteId}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
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
