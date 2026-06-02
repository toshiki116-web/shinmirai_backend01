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
import { Plus, Search, Box, Wifi, WifiOff } from "lucide-react"
import { mockUnits, statusLabels, formatDateTime, type Unit } from "@/lib/mock-data"
import { UnitDialog } from "@/components/dialogs/unit-dialog"
import { DeleteDialog } from "@/components/dialogs/delete-dialog"
import { api } from "@/lib/api-client"

export default function UnitsPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [editUnit, setEditUnit] = useState<Unit | null>(null)
  const [deleteUnit, setDeleteUnit] = useState<Unit | null>(null)

  function handleRefresh() {
    window.location.reload()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">筐体管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            全{mockUnits.length}筐体を管理しています
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          筐体を追加
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="border-l-4 border-l-chart-2">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">正常</p>
            <p className="text-2xl font-bold">{mockUnits.filter((u) => u.status === "normal").length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[oklch(0.7_0.15_60)]">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">警告</p>
            <p className="text-2xl font-bold">{mockUnits.filter((u) => u.status === "warning").length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">停止</p>
            <p className="text-2xl font-bold">{mockUnits.filter((u) => u.status === "stop").length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-muted-foreground">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">保守中</p>
            <p className="text-2xl font-bold">{mockUnits.filter((u) => u.status === "maintenance").length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="筐体ID・名前・PCUUIDで検索" className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">筐体ID</TableHead>
                <TableHead>筐体名</TableHead>
                <TableHead>所属拠点</TableHead>
                <TableHead className="text-center">接続</TableHead>
                <TableHead className="text-center">ステータス</TableHead>
                <TableHead className="text-center">ライセンス</TableHead>
                <TableHead>最終通信</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockUnits.map((unit) => (
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
                  <TableCell className="text-sm text-muted-foreground">
                    {unit.site ? (
                      <Link href={`/sites/${unit.siteId}`} className="hover:text-foreground hover:underline">
                        {unit.site.siteName}
                      </Link>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    {unit.connectionMode === "online" ? (
                      <Wifi className="mx-auto h-4 w-4 text-chart-2" />
                    ) : (
                      <WifiOff className="mx-auto h-4 w-4 text-muted-foreground" />
                    )}
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
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditUnit(unit)}>
                        編集
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteUnit(unit)}>
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

      <UnitDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={handleRefresh} />
      <UnitDialog open={!!editUnit} onOpenChange={(v) => !v && setEditUnit(null)} unit={editUnit} onSuccess={handleRefresh} />
      <DeleteDialog
        open={!!deleteUnit}
        onOpenChange={(v) => !v && setDeleteUnit(null)}
        title="筐体を削除"
        description={`${deleteUnit?.unitName}（${deleteUnit?.unitId}）を削除します。この操作は取り消せません。`}
        onConfirm={() => api.deleteUnit(deleteUnit!.unitId)}
        onSuccess={handleRefresh}
      />
    </div>
  )
}
