"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Pencil, Trash2, Film, MapPin, HardDrive, Hash } from "lucide-react"
import { statusLabels, formatDate, formatFileSize, type Content } from "@/lib/mock-data"
import { ContentDialog } from "@/components/dialogs/content-dialog"
import { DeleteDialog } from "@/components/dialogs/delete-dialog"
import { api, ApiClientError } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"

type AssignedSite = {
  siteId: string
  siteName: string
}

type ContentDetail = Content & {
  assignedSites?: AssignedSite[]
}

export default function ContentDetailPage() {
  const router = useRouter()
  const { contentId } = useParams<{ contentId: string }>()
  const [content, setContent] = useState<ContentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { admin } = useAuth()
  const canEdit = admin?.role === "master" || admin?.role === "editor"

  const fetchContent = useCallback(async () => {
    setIsLoading(true)
    setError("")
    try {
      const data = await api.getContent(contentId)
      setContent(data)
    } catch (err) {
      setContent(null)
      setError(err instanceof ApiClientError ? err.message : "コンテンツ詳細の取得に失敗しました")
    } finally {
      setIsLoading(false)
    }
  }, [contentId])

  useEffect(() => {
    void fetchContent()
  }, [fetchContent])

  if (isLoading && !content) {
    return <p className="py-20 text-center text-sm text-muted-foreground">読み込み中...</p>
  }

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-muted-foreground">{error || "コンテンツが見つかりません"}</p>
        <Button variant="outline" render={<Link href="/contents" />}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          コンテンツ一覧に戻る
        </Button>
      </div>
    )
  }

  const assignedSites = content.assignedSites ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/contents" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Film className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">{content.contentName}</h1>
          </div>
          <p className="mt-0.5 font-mono text-sm text-muted-foreground">{content.contentId}</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              編集
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              削除
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[100px_1fr] gap-y-3 text-sm">
              <span className="text-muted-foreground">言語</span>
              <Badge variant="outline" className="w-fit text-[10px]">
                {content.language.toUpperCase()}
              </Badge>
              <span className="text-muted-foreground">配信区分</span>
              <Badge variant={statusLabels[content.deliveryType]?.variant ?? "secondary"} className="w-fit">
                {statusLabels[content.deliveryType]?.label ?? content.deliveryType}
              </Badge>
              <span className="text-muted-foreground">カテゴリ</span>
              <Badge variant={statusLabels[content.statusCategory]?.variant ?? "secondary"} className="w-fit">
                {statusLabels[content.statusCategory]?.label ?? content.statusCategory}
              </Badge>
              <span className="text-muted-foreground">登録日</span>
              <span>{formatDate(content.createdAt)}</span>
              <span className="text-muted-foreground">更新日</span>
              <span>{formatDate(content.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="h-4 w-4" />
              ファイル情報
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[100px_1fr] gap-y-3 text-sm">
              <span className="text-muted-foreground">ファイル</span>
              <span className="font-mono text-xs break-all">{content.filePath ?? "未アップロード"}</span>
              <span className="text-muted-foreground">サイズ</span>
              <span>{formatFileSize(content.fileSize)}</span>
              <span className="text-muted-foreground">チェックサム</span>
              <span className="font-mono text-xs">{content.checksum ?? "-"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Hash className="h-4 w-4" />
              バージョン
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10">
                <span className="text-2xl font-bold text-primary">v{content.version}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>最終更新: {formatDate(content.updatedAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              配信対象拠点（{assignedSites.length}拠点）
            </CardTitle>
            {canEdit && (
              <Button variant="outline" size="sm">
                配信先を編集
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {assignedSites.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              配信先拠点が設定されていません
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {assignedSites.map((site) => (
                <Link
                  key={site.siteId}
                  href={`/sites/${site.siteId}`}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                >
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{site.siteName}</p>
                    <p className="text-xs text-muted-foreground">{site.siteId}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <>
          <ContentDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            content={content}
            onSuccess={fetchContent}
          />
          <DeleteDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="コンテンツを削除"
            description={`${content.contentName}（${content.contentId}）を削除します。この操作は取り消せません。`}
            onConfirm={() => api.deleteContent(content.contentId)}
            onSuccess={() => router.push("/contents")}
          />
        </>
      )}
    </div>
  )
}
