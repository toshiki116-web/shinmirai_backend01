"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ArrowLeft, Pencil, Trash2, Wifi, WifiOff, Shield, Clock, Download, Loader2 } from "lucide-react"
import { statusLabels, getEffectiveLicenseStatus, formatDate, formatDateTime, formatFileSize, type Unit } from "@/lib/mock-data"
import { UnitDialog } from "@/components/dialogs/unit-dialog"
import { DeleteDialog } from "@/components/dialogs/delete-dialog"
import { api, ApiClientError, type UnitLogFile } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"

const UNIT_LOG_LIMIT = 20

type UnitAlert = {
  id: string
  alertType: string
  detail: string | null
  level: "info" | "warning" | "error" | "critical"
  occurredAt: string
}

type UnitDetail = Unit & {
  deviceAlerts?: UnitAlert[]
}

export default function UnitDetailPage() {
  const router = useRouter()
  const { unitId } = useParams<{ unitId: string }>()
  const [unit, setUnit] = useState<UnitDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [licenseStatus, setLicenseStatus] = useState("unknown")
  const [licenseExpiredAt, setLicenseExpiredAt] = useState("")
  const [licenseError, setLicenseError] = useState("")
  const [isLicenseSaving, setIsLicenseSaving] = useState(false)
  const [logs, setLogs] = useState<UnitLogFile[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsPage, setLogsPage] = useState(1)
  const [isLogsLoading, setIsLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState("")
  const [downloadingLogId, setDownloadingLogId] = useState<string | null>(null)
  const { admin } = useAuth()
  const canEdit = admin?.role === "master" || admin?.role === "editor"

  const fetchUnit = useCallback(async () => {
    setIsLoading(true)
    setError("")
    try {
      const data = await api.getUnit(unitId)
      setUnit(data)
      setLicenseStatus(data.licenseStatus ?? "unknown")
      setLicenseExpiredAt(data.licenseExpiredAt ? data.licenseExpiredAt.slice(0, 10) : "")
    } catch (err) {
      setUnit(null)
      setError(err instanceof ApiClientError ? err.message : "筐体詳細の取得に失敗しました")
    } finally {
      setIsLoading(false)
    }
  }, [unitId])

  useEffect(() => {
    void fetchUnit()
  }, [fetchUnit])

  const fetchLogs = useCallback(async () => {
    setIsLogsLoading(true)
    setLogsError("")
    try {
      const data = await api.getUnitLogs(unitId, { page: logsPage, limit: UNIT_LOG_LIMIT })
      setLogs(data.items)
      setLogsTotal(data.total)
    } catch (err) {
      setLogs([])
      setLogsTotal(0)
      setLogsError(err instanceof ApiClientError ? err.message : "ログファイル一覧の取得に失敗しました")
    } finally {
      setIsLogsLoading(false)
    }
  }, [unitId, logsPage])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  async function handleLicenseSave() {
    setLicenseError("")
    setIsLicenseSaving(true)
    try {
      await api.updateUnitLicense(unitId, {
        licenseStatus,
        licenseExpiredAt: licenseExpiredAt ? `${licenseExpiredAt}T00:00:00.000Z` : null,
      })
      await fetchUnit()
    } catch (err) {
      setLicenseError(err instanceof ApiClientError ? err.message : "ライセンス更新に失敗しました")
    } finally {
      setIsLicenseSaving(false)
    }
  }

  async function handleDownloadLog(log: UnitLogFile) {
    setLogsError("")
    setDownloadingLogId(log.logFileId)
    try {
      const { downloadUrl } = await api.createUnitLogDownloadUrl(unitId, log.logFileId)
      const a = document.createElement("a")
      a.href = downloadUrl
      a.download = log.fileName
      a.rel = "noopener noreferrer"
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      setLogsError(err instanceof ApiClientError ? err.message : "ログファイルのダウンロードURL発行に失敗しました")
    } finally {
      setDownloadingLogId(null)
    }
  }

  if (isLoading && !unit) {
    return <p className="py-20 text-center text-sm text-muted-foreground">読み込み中...</p>
  }

  if (!unit) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-muted-foreground">{error || "筐体が見つかりません"}</p>
        <Button variant="outline" render={<Link href="/units" />}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          筐体一覧に戻る
        </Button>
      </div>
    )
  }

  const st = statusLabels[unit.status]
  const alerts = (unit.deviceAlerts ?? []).slice(0, 5)
  const logsTotalPages = Math.max(1, Math.ceil(logsTotal / UNIT_LOG_LIMIT))
  const showLogsPagination = logsTotal > UNIT_LOG_LIMIT

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
                {(() => {
                  const effectiveLicenseStatus = getEffectiveLicenseStatus(unit.licenseStatus, unit.licenseExpiredAt)
                  return (
                    <Badge variant={statusLabels[effectiveLicenseStatus]?.variant ?? "secondary"}>
                      {statusLabels[effectiveLicenseStatus]?.label ?? effectiveLicenseStatus}
                    </Badge>
                  )
                })()}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">有効期限</span>
                <span className="text-sm">
                  {unit.licenseExpiredAt ? formatDate(unit.licenseExpiredAt) : "-"}
                </span>
              </div>
              {canEdit && (
                <div className="space-y-2 border-t pt-3">
                  <select
                    value={licenseStatus}
                    onChange={(e) => setLicenseStatus(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="valid">有効</option>
                    <option value="expired">期限切れ</option>
                    <option value="suspended">停止</option>
                    <option value="unknown">未確認</option>
                  </select>
                  <Input
                    type="date"
                    value={licenseExpiredAt}
                    onChange={(e) => setLicenseExpiredAt(e.target.value)}
                  />
                  {licenseError && <p className="text-xs text-destructive">{licenseError}</p>}
                  <Button size="sm" onClick={() => { void handleLicenseSave() }} disabled={isLicenseSaving}>
                    {isLicenseSaving ? "保存中..." : "ライセンスを保存"}
                  </Button>
                </div>
              )}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ログファイル</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logsError && (
            <div className="mx-6 mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {logsError}
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ファイル名</TableHead>
                <TableHead className="w-[120px] text-right">サイズ</TableHead>
                <TableHead className="w-[180px]">アップロード日時</TableHead>
                <TableHead className="w-[140px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    {isLogsLoading ? "読み込み中..." : "ログファイルがありません"}
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const isDownloading = downloadingLogId === log.logFileId
                  return (
                    <TableRow key={log.logFileId}>
                      <TableCell className="max-w-[420px] truncate font-mono text-xs">
                        {log.fileName}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatFileSize(String(log.fileSize))}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(log.uploadedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { void handleDownloadLog(log) }}
                          disabled={isDownloading}
                        >
                          {isDownloading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          ダウンロード
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          {showLogsPagination && (
            <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
              <span className="text-sm text-muted-foreground">
                {logsPage} / {logsTotalPages} ページ
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLogsPage((page) => Math.max(1, page - 1))}
                  disabled={isLogsLoading || logsPage <= 1}
                >
                  前へ
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLogsPage((page) => Math.min(logsTotalPages, page + 1))}
                  disabled={isLogsLoading || logsPage >= logsTotalPages}
                >
                  次へ
                </Button>
              </div>
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
            onSuccess={fetchUnit}
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
