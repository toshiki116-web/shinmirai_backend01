"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { api, ApiClientError, type AdminRole, type AdminUser } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { formatDate } from "@/lib/mock-data"
import { Eye, EyeOff, KeyRound, Plus, Search, ShieldCheck, UserRound } from "lucide-react"

const roleLabels: Record<AdminRole, string> = {
  master: "マスター",
  editor: "編集者",
  viewer: "閲覧者",
}

type UserFormState = {
  email: string
  name: string
  role: AdminRole
  note: string
  password: string
  notifyOnIncident: boolean
}

const emptyForm: UserFormState = {
  email: "",
  name: "",
  role: "viewer",
  note: "",
  password: "",
  notifyOnIncident: false,
}

export default function UsersPage() {
  const router = useRouter()
  const { admin, isLoading: authLoading } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [form, setForm] = useState<UserFormState>(emptyForm)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [showResetPassword, setShowResetPassword] = useState(false)

  const isMaster = admin?.role === "master"

  const fetchUsers = useCallback(async () => {
    if (!isMaster) return
    setIsLoading(true)
    setError("")
    try {
      const data = await api.getUsers({ keyword: keyword || undefined, limit: 100 })
      setUsers(data.items)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "ユーザー一覧の取得に失敗しました")
    } finally {
      setIsLoading(false)
    }
  }, [isMaster, keyword])

  useEffect(() => {
    if (!authLoading && !isMaster) {
      router.replace("/")
    }
  }, [authLoading, isMaster, router])

  useEffect(() => {
    void fetchUsers()
  }, [fetchUsers])

  const activeCount = useMemo(() => users.filter((user) => user.isActive).length, [users])

  function openCreateDialog() {
    setEditingUser(null)
    setForm(emptyForm)
    setShowPassword(false)
    setError("")
    setFormOpen(true)
  }

  function openEditDialog(user: AdminUser) {
    setEditingUser(user)
    setForm({
      email: user.email,
      name: user.name,
      role: user.role,
      note: user.note ?? "",
      password: "",
      notifyOnIncident: user.notifyOnIncident,
    })
    setError("")
    setFormOpen(true)
  }

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setIsLoading(true)
    try {
      if (editingUser) {
        await api.updateUser(editingUser.id, {
          email: form.email,
          name: form.name,
          role: form.role,
          note: form.note || "",
          notifyOnIncident: form.notifyOnIncident,
        })
      } else {
        await api.createUser({
          email: form.email,
          name: form.name,
          password: form.password,
          role: form.role,
          note: form.note || undefined,
          notifyOnIncident: form.notifyOnIncident,
        })
      }
      setFormOpen(false)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "保存に失敗しました")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleToggleActive(user: AdminUser) {
    setError("")
    setIsLoading(true)
    try {
      await api.updateUser(user.id, { isActive: !user.isActive })
      await fetchUsers()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "状態変更に失敗しました")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!passwordTarget) return
    setError("")
    setIsLoading(true)
    try {
      await api.resetUserPassword(passwordTarget.id, resetPassword)
      setPasswordTarget(null)
      setResetPassword("")
      await fetchUsers()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "パスワードリセットに失敗しました")
    } finally {
      setIsLoading(false)
    }
  }

  if (authLoading || !isMaster) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ユーザー管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            全{total}ユーザー / 有効{activeCount}ユーザー
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          ユーザーを追加
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <form
            className="relative max-w-sm"
            onSubmit={(e) => {
              e.preventDefault()
              void fetchUsers()
            }}
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="メール・名前で検索"
              className="pl-9"
            />
          </form>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ユーザー</TableHead>
                <TableHead>ロール</TableHead>
                <TableHead>状態</TableHead>
                <TableHead>備考</TableHead>
                <TableHead>登録日</TableHead>
                <TableHead className="w-[260px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {isLoading ? "読み込み中..." : "ユーザーが見つかりません"}
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                          <UserRound className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium">{user.name}</p>
                          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === "master" ? "default" : user.role === "editor" ? "secondary" : "outline"} className="gap-1">
                        {user.role === "master" && <ShieldCheck className="h-3 w-3" />}
                        {roleLabels[user.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "default" : "secondary"}>
                        {user.isActive ? "有効" : "無効"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                      {user.note || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEditDialog(user)}>
                          編集
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setPasswordTarget(user)
                            setResetPassword("")
                            setShowResetPassword(false)
                          }}
                        >
                          PWリセット
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => void handleToggleActive(user)}
                        >
                          {user.isActive ? "無効化" : "有効化"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingUser ? "ユーザーを編集" : "ユーザーを追加"}</DialogTitle>
            <DialogDescription>
              {editingUser ? `${editingUser.email} の情報を編集します` : "管理画面にログインできるユーザーを登録します"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveUser} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="user-email">メールアドレス *</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
                <label
                  htmlFor="notify-on-incident"
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-input px-3 py-2 text-sm"
                >
                  <input
                    id="notify-on-incident"
                    type="checkbox"
                    checked={form.notifyOnIncident}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, notifyOnIncident: e.target.checked }))
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  <span>不具合発生時に自動メールを送る</span>
                </label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-name">名前 *</Label>
                <Input
                  id="user-name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-role">ロール</Label>
              <select
                id="user-role"
                value={form.role}
                onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as AdminRole }))}
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="master">マスター</option>
                <option value="editor">編集者</option>
                <option value="viewer">閲覧者</option>
              </select>
            </div>
            {!editingUser && (
              <div className="space-y-2">
                <Label htmlFor="user-password">初期パスワード *</Label>
                <div className="relative">
                  <Input
                    id="user-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="user-note">備考</Label>
              <Textarea
                id="user-note"
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                キャンセル
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "保存中..." : "保存する"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordTarget} onOpenChange={(open) => !open && setPasswordTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              パスワードリセット
            </DialogTitle>
            <DialogDescription>
              {passwordTarget?.email} の新しいパスワードを設定します
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-password">新しいパスワード</Label>
              <div className="relative">
                <Input
                  id="reset-password"
                  type={showResetPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showResetPassword ? "パスワードを隠す" : "パスワードを表示"}
                >
                  {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPasswordTarget(null)}>
                キャンセル
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "更新中..." : "更新する"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
