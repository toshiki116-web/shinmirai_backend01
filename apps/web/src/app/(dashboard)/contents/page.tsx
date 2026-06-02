"use client"

import { useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Plus, Search, Film, MapPin } from "lucide-react"
import { mockContents, statusLabels, formatDate, formatFileSize, type Content } from "@/lib/mock-data"
import { ContentDialog } from "@/components/dialogs/content-dialog"
import { DeleteDialog } from "@/components/dialogs/delete-dialog"
import { api } from "@/lib/api-client"

export default function ContentsPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [editContent, setEditContent] = useState<Content | null>(null)
  const [deleteContent, setDeleteContent] = useState<Content | null>(null)

  function handleRefresh() {
    window.location.reload()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">コンテンツ管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            全{mockContents.length}コンテンツを管理しています
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          コンテンツを追加
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="コンテンツ名・IDで検索" className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">コンテンツID</TableHead>
                <TableHead>コンテンツ名</TableHead>
                <TableHead className="text-center">言語</TableHead>
                <TableHead className="text-center">配信区分</TableHead>
                <TableHead className="text-center">カテゴリ</TableHead>
                <TableHead className="text-right">サイズ</TableHead>
                <TableHead className="text-center">Ver</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <MapPin className="h-3 w-3" />配信先
                  </div>
                </TableHead>
                <TableHead>登録日</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockContents.map((content) => (
                <TableRow key={content.contentId}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/contents/${content.contentId}`} className="text-primary hover:underline">
                      {content.contentId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Film className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{content.contentName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-[10px]">{content.language.toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={statusLabels[content.deliveryType]?.variant ?? "secondary"}>
                      {statusLabels[content.deliveryType]?.label ?? content.deliveryType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={statusLabels[content.statusCategory]?.variant ?? "secondary"}>
                      {statusLabels[content.statusCategory]?.label ?? content.statusCategory}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatFileSize(content.fileSize)}
                  </TableCell>
                  <TableCell className="text-center text-sm">v{content.version}</TableCell>
                  <TableCell className="text-center">
                    <span className="font-semibold">{content.assignedSiteCount}</span>
                    <span className="text-xs text-muted-foreground">拠点</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(content.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditContent(content)}>
                        編集
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteContent(content)}>
                        削除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ContentDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={handleRefresh} />
      <ContentDialog open={!!editContent} onOpenChange={(v) => !v && setEditContent(null)} content={editContent} onSuccess={handleRefresh} />
      <DeleteDialog
        open={!!deleteContent}
        onOpenChange={(v) => !v && setDeleteContent(null)}
        title="コンテンツを削除"
        description={`${deleteContent?.contentName}（${deleteContent?.contentId}）を削除します。この操作は取り消せません。`}
        onConfirm={() => api.deleteContent(deleteContent!.contentId)}
        onSuccess={handleRefresh}
      />
    </div>
  )
}
