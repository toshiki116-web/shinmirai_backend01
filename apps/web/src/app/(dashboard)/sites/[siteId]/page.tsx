"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeft, Pencil, Trash2, Box } from "lucide-react"
import { mockSites, mockUnits, statusLabels, formatDate, formatDateTime } from "@/lib/mock-data"
import { SiteDialog } from "@/components/dialogs/site-dialog"
import { DeleteDialog } from "@/components/dialogs/delete-dialog"
import { api } from "@/lib/api-client"

export default function SiteDetailPage() {
  const router = useRouter()
  const { siteId } = useParams<{ siteId: string }>()
  const site = mockSites.find((s) => s.siteId === siteId)
  const units = mockUnits.filter((u) => u.siteId === siteId)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (!site) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-muted-foreground">拠点が見つかりません</p>
        <Button variant="outline" render={<Link href="/sites" />}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          拠点一覧に戻る
        </Button>
      </div>
    )
  }

  const st = statusLabels[site.status]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/sites" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{site.siteName}</h1>
            <Badge variant={st?.variant ?? "secondary"}>{st?.label ?? site.status}</Badge>
          </div>
          <p className="mt-0.5 font-mono text-sm text-muted-foreground">{site.siteId}</p>
        </div>
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
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[100px_1fr] gap-y-3 text-sm">
              <span className="text-muted-foreground">住所</span>
              <span>{site.address ?? "-"}</span>
              <span className="text-muted-foreground">電話番号</span>
              <span>{site.phoneNumber ?? "-"}</span>
              <span className="text-muted-foreground">備考</span>
              <span>{site.note ?? "-"}</span>
              <span className="text-muted-foreground">登録日</span>
              <span>{formatDate(site.createdAt)}</span>
              <span className="text-muted-foreground">更新日</span>
              <span>{formatDate(site.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">統計</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold">{units.length}</p>
                <p className="text-xs text-muted-foreground">筐体数</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-chart-2">
                  {units.filter((u) => u.status === "normal").length}
                </p>
                <p className="text-xs text-muted-foreground">正常稼働</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-destructive">
                  {units.filter((u) => u.status === "warning" || u.status === "stop").length}
                </p>
                <p className="text-xs text-muted-foreground">要対応</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">配下の筐体</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>筐体ID</TableHead>
                <TableHead>筐体名</TableHead>
                <TableHead className="text-center">接続</TableHead>
                <TableHead className="text-center">ステータス</TableHead>
                <TableHead className="text-center">ライセンス</TableHead>
                <TableHead>最終通信</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    配下の筐体がありません
                  </TableCell>
                </TableRow>
              ) : (
                units.map((unit) => (
                  <TableRow key={unit.unitId}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/units/${unit.unitId}`} className="text-primary hover:underline">
                        {unit.unitId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Box className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{unit.unitName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={statusLabels[unit.connectionMode]?.variant ?? "secondary"}>
                        {statusLabels[unit.connectionMode]?.label ?? unit.connectionMode}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={statusLabels[unit.status]?.variant ?? "secondary"}>
                        {statusLabels[unit.status]?.label ?? unit.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={statusLabels[unit.licenseStatus]?.variant ?? "secondary"}>
                        {statusLabels[unit.licenseStatus]?.label ?? unit.licenseStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {unit.lastSeenAt ? formatDateTime(unit.lastSeenAt) : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SiteDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        site={site}
        onSuccess={() => window.location.reload()}
      />
      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="拠点を削除"
        description={`${site.siteName}（${site.siteId}）を削除します。この操作は取り消せません。`}
        onConfirm={() => api.deleteSite(site.siteId)}
        onSuccess={() => router.push("/sites")}
      />
    </div>
  )
}
