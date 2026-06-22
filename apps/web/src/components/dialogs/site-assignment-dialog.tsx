"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
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

type AssignedSite = {
  siteId: string
  siteName: string
}

type SiteAssignmentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  contentId: string
  assignedSites: AssignedSite[]
  onSuccess: () => void
}

async function fetchAllSites(): Promise<Site[]> {
  const limit = 100
  const first = await api.getSites({ page: 1, limit })
  const sites: Site[] = [...first.items]
  const totalPages = Math.ceil(first.total / limit)

  // TODO: Replace this with a search-based picker if the number of sites grows substantially.
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await api.getSites({ page, limit })
    sites.push(...next.items)
  }

  return sites
}

export function SiteAssignmentDialog({
  open,
  onOpenChange,
  contentId,
  assignedSites,
  onSuccess,
}: SiteAssignmentDialogProps) {
  const [sites, setSites] = useState<Site[]>([])
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([])
  const [isFetching, setIsFetching] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return

    let isActive = true
    void Promise.resolve().then(() => {
      if (!isActive) return

      setSelectedSiteIds(assignedSites.map((site) => site.siteId))
      setSites([])
      setError("")
      setIsFetching(true)

      void fetchAllSites()
        .then((data) => {
          if (isActive) {
            setSites(data)
          }
        })
        .catch((err) => {
          if (isActive) {
            setSites([])
            setError(err instanceof ApiClientError ? err.message : "拠点一覧の取得に失敗しました")
          }
        })
        .finally(() => {
          if (isActive) {
            setIsFetching(false)
          }
        })
    })

    return () => {
      isActive = false
    }
  }, [open, assignedSites])

  function toggleSite(siteId: string) {
    setSelectedSiteIds((current) =>
      current.includes(siteId)
        ? current.filter((id) => id !== siteId)
        : [...current, siteId],
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")
    setIsSubmitting(true)

    try {
      await api.assignSites(contentId, selectedSiteIds)
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "配信先の更新に失敗しました")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>配信先拠点を編集</DialogTitle>
          <DialogDescription>{contentId} の配信対象拠点を設定します</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label>配信先拠点</Label>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-input p-3">
              {isFetching ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  拠点を読み込み中...
                </div>
              ) : sites.length === 0 ? (
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={isFetching || isSubmitting}>
              {isSubmitting ? "保存中..." : "保存する"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
