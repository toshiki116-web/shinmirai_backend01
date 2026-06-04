"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Plus, Search, MapPin } from "lucide-react"
import { statusLabels, formatDate, type Site } from "@/lib/mock-data"
import { SiteDialog } from "@/components/dialogs/site-dialog"
import { DeleteDialog } from "@/components/dialogs/delete-dialog"
import { api, ApiClientError } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [editSite, setEditSite] = useState<Site | null>(null)
  const [deleteSite, setDeleteSite] = useState<Site | null>(null)
  const { admin } = useAuth()
  const canEdit = admin?.role === "master" || admin?.role === "editor"

  const fetchSites = useCallback(async () => {
    setIsLoading(true)
    setError("")
    try {
      const data = await api.getSites({ limit: 100, keyword: keyword || undefined })
      setSites(data.items)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "拠点一覧の取得に失敗しました")
    } finally {
      setIsLoading(false)
    }
  }, [keyword])

  useEffect(() => {
    void fetchSites()
  }, [fetchSites])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">拠点管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            全{total}拠点を管理しています
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            拠点を追加
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <form
              className="relative flex-1 max-w-sm"
              onSubmit={(e) => {
                e.preventDefault()
                void fetchSites()
              }}
            >
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="拠点名・IDで検索"
                className="pl-9"
              />
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">拠点ID</TableHead>
                <TableHead>拠点名</TableHead>
                <TableHead>住所</TableHead>
                <TableHead className="text-center">筐体数</TableHead>
                <TableHead className="text-center">ステータス</TableHead>
                <TableHead>登録日</TableHead>
                {canEdit && <TableHead className="w-[80px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canEdit ? 7 : 6} className="py-10 text-center text-muted-foreground">
                    {isLoading ? "読み込み中..." : "拠点がありません"}
                  </TableCell>
                </TableRow>
              ) : (
                sites.map((site) => {
                const st = statusLabels[site.status]
                return (
                  <TableRow key={site.siteId}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/sites/${site.siteId}`} className="text-primary hover:underline">
                        {site.siteId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{site.siteName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {site.address ?? "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-semibold">{site.unitCount}</span>
                      <span className="text-xs text-muted-foreground">台</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={st?.variant ?? "secondary"}>
                        {st?.label ?? site.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(site.createdAt)}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setEditSite(site)}
                          >
                            編集
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => setDeleteSite(site)}
                          >
                            削除
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canEdit && (
        <>
          <SiteDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={fetchSites} />
          <SiteDialog open={!!editSite} onOpenChange={(v) => !v && setEditSite(null)} site={editSite} onSuccess={fetchSites} />
          <DeleteDialog
            open={!!deleteSite}
            onOpenChange={(v) => !v && setDeleteSite(null)}
            title="拠点を削除"
            description={`${deleteSite?.siteName}（${deleteSite?.siteId}）を削除します。この操作は取り消せません。`}
            onConfirm={() => api.deleteSite(deleteSite!.siteId)}
            onSuccess={fetchSites}
          />
        </>
      )}
    </div>
  )
}
