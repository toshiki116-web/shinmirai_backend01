"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Pencil, Trash2, Wifi, WifiOff, Shield, Clock } from "lucide-react"
import { mockUnits, mockAlerts, statusLabels, formatDate, formatDateTime } from "@/lib/mock-data"
import { UnitDialog } from "@/components/dialogs/unit-dialog"
import { DeleteDialog } from "@/components/dialogs/delete-dialog"
import { api } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"

export default function UnitDetailPage() {
  const router = useRouter()
  const { unitId } = useParams<{ unitId: string }>()
  const unit = mockUnits.find((u) => u.unitId === unitId)
  const alerts = mockAlerts.filter((a) => a.unitId === unitId).slice(0, 5)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { admin } = useAuth()
  const canEdit = admin?.role === "master" || admin?.role === "editor"

  if (!unit) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-muted-foreground">筐体が見つかりません</p>
        <Button variant="outline" render={<Link href="/units" />}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          筐体一覧に戻る
        </Button>
      </div>
    )
  }

  const st = statusLabels[unit.status]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/units" />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{unit.unitName}</h1>
            <Badge variant={st?.variant ?? "secondary"}>{st?.label ?? unit.status}</Badge>
            {unit.connectionMode === "online" ? (
              <Badge variant="outline" className="gap-1">
                <Wifi className="h-3 w-3" /> オンライン
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <WifiOff className="h-3 w-3" /> オフライン
              </Badge>
            )}
          </div>
          <p className="mt-0.5 font-mono text-sm text-muted-foreground">{unit.unitId}</p>
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

      {unit.alertMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">{unit.alertMessage}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-[100px_1fr] gap-y-3 text-sm">
              <span className="text-muted-foreground">所属拠点</span>
              <span>
                {unit.site ? (
                  <Link href={`/sites/${unit.siteId}`} className="text-primary hover:underline">
                    {unit.site.siteName}
                  </Link>
                ) : "-"}
              </span>
              <span className="text-muted-foreground">PC UUID</span>
              <span className="font-mono text-xs break-all">{unit.pcUuid ?? "-"}</span>
              <span className="text-muted-foreground">登録日</span>
              <span>{formatDate(unit.createdAt)}</span>
              <span className="text-muted-foreground">更新日</span>
              <span>{formatDate(unit.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              ライセンス
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">ステータス</span>
                <Badge variant={statusLabels[unit.licenseStatus]?.variant ?? "secondary"}>
                  {statusLabels[unit.licenseStatus]?.label ?? unit.licenseStatus}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">有効期限</span>
                <span className="text-sm">
                  {unit.licenseExpiredAt ? formatDate(unit.licenseExpiredAt) : "-"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              通信状態
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">接続モード</span>
                <Badge variant={statusLabels[unit.connectionMode]?.variant ?? "secondary"}>
                  {statusLabels[unit.connectionMode]?.label ?? unit.connectionMode}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">最終通信</span>
                <span className="text-sm">
                  {unit.lastSeenAt ? formatDateTime(unit.lastSeenAt) : "-"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">直近のアラート</CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              アラートはありません
            </p>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                      alert.level === "critical" || alert.level === "error"
                        ? "bg-destructive"
                        : alert.level === "warning"
                          ? "bg-[oklch(0.7_0.15_60)]"
                          : "bg-muted-foreground"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{alert.alertType}</p>
                    <p className="text-xs text-muted-foreground">{alert.detail}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(alert.occurredAt)}
                    </p>
                  </div>
                  <Badge variant={statusLabels[alert.level]?.variant ?? "secondary"} className="text-[10px]">
                    {statusLabels[alert.level]?.label ?? alert.level}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit && (
        <>
          <UnitDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            unit={unit}
            onSuccess={() => window.location.reload()}
          />
          <DeleteDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="筐体を削除"
            description={`${unit.unitName}（${unit.unitId}）を削除します。この操作は取り消せません。`}
            onConfirm={() => api.deleteUnit(unit.unitId)}
            onSuccess={() => router.push("/units")}
          />
        </>
      )}
    </div>
  )
}
