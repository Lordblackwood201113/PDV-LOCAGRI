import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { Id } from '../../../convex/_generated/dataModel'
import { Users, Clock, UserCheck } from 'lucide-react'

type UserRole = 'admin' | 'manager' | 'cashier' | 'pending'

export function UserManagement() {
  const [updatingUserId, setUpdatingUserId] = useState<Id<'users'> | null>(null)

  const users = useQuery(api.users.getAllUsers)
  const currentUser = useQuery(api.users.getCurrentUser)
  const updateRole = useMutation(api.users.updateUserRole)

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-purple-500 text-[10px] sm:text-xs">Admin</Badge>
      case 'manager':
        return <Badge className="bg-blue-500 text-[10px] sm:text-xs">Manager</Badge>
      case 'cashier':
        return <Badge className="bg-[#7ABE4E] text-[10px] sm:text-xs">Caissier</Badge>
      case 'pending':
        return <Badge className="bg-[#CF761C] text-[10px] sm:text-xs">En attente</Badge>
      default:
        return <Badge variant="outline" className="text-[10px] sm:text-xs">{role}</Badge>
    }
  }

  const handleRoleChange = async (userId: Id<'users'>, newRole: UserRole) => {
    setUpdatingUserId(userId)
    try {
      await updateRole({ userId, newRole })
      toast.success('Rôle mis à jour')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setUpdatingUserId(null)
    }
  }

  if (users === undefined || currentUser === undefined) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-muted-foreground text-sm">Chargement...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Seul l'admin peut gérer les utilisateurs
  if (currentUser?.role !== 'admin') {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground text-sm">
          Accès réservé aux administrateurs
        </CardContent>
      </Card>
    )
  }

  // Séparer les utilisateurs en attente des autres
  const pendingUsers = users.filter(u => u.role === 'pending')
  const activeUsers = users.filter(u => u.role !== 'pending')

  const handleQuickApprove = async (userId: Id<'users'>, role: UserRole) => {
    setUpdatingUserId(userId)
    try {
      await updateRole({ userId, newRole: role })
      toast.success('Utilisateur validé', {
        description: `Accès accordé avec le rôle ${role === 'cashier' ? 'Caissier' : role === 'manager' ? 'Manager' : 'Admin'}`,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setUpdatingUserId(null)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Section utilisateurs en attente */}
      {pendingUsers.length > 0 && (
        <Card className="border-[#CF761C] bg-[#CF761C]/5">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-[#CF761C]" />
              <span className="truncate">Inscriptions en attente</span>
              <Badge className="bg-[#CF761C] ml-auto text-[10px] sm:text-xs">{pendingUsers.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Ces utilisateurs attendent votre validation
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="space-y-3">
              {pendingUsers.map((user) => {
                const isUpdating = updatingUserId === user._id

                return (
                  <div
                    key={user._id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 bg-white rounded-lg border"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#CF761C]/10 flex items-center justify-center text-[#CF761C] font-medium flex-shrink-0 text-sm">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Inscrit le {formatDate(user.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
                      {isUpdating ? (
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[#7ABE4E] border-[#7ABE4E] hover:bg-[#7ABE4E]/10 text-xs h-8 px-2 sm:px-3"
                            onClick={() => handleQuickApprove(user._id, 'cashier')}
                          >
                            <UserCheck className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                            <span className="hidden sm:inline">Caissier</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-blue-500 border-blue-500 hover:bg-blue-50 text-xs h-8 px-2 sm:px-3"
                            onClick={() => handleQuickApprove(user._id, 'manager')}
                          >
                            <UserCheck className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                            <span className="hidden sm:inline">Manager</span>
                          </Button>
                          <Select
                            onValueChange={(value) => handleQuickApprove(user._id, value as UserRole)}
                          >
                            <SelectTrigger className="w-[70px] sm:w-[100px] h-8 text-xs">
                              <SelectValue placeholder="..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section utilisateurs actifs */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124]" />
            Utilisateurs actifs
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {activeUsers.length} utilisateur{activeUsers.length > 1 ? 's' : ''} avec accès
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        {activeUsers.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">
            Aucun utilisateur actif
          </p>
        ) : (
          <div className="space-y-3">
            {activeUsers.map((user) => {
              const isCurrentUser = user._id === currentUser._id
              const isUpdating = updatingUserId === user._id

              return (
                <div
                  key={user._id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center font-medium flex-shrink-0 text-sm">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{user.name}</p>
                        {isCurrentUser && (
                          <span className="text-[10px] text-muted-foreground">(vous)</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {getRoleBadge(user.role)}
                        <span className="text-[10px] text-muted-foreground hidden sm:inline">
                          {formatDate(user._creationTime)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
                    {isCurrentUser ? (
                      <span className="text-xs text-muted-foreground">-</span>
                    ) : (
                      <Select
                        value={user.role}
                        onValueChange={(value) => handleRoleChange(user._id, value as UserRole)}
                        disabled={isUpdating}
                      >
                        <SelectTrigger className="w-[100px] sm:w-[120px] h-8 text-xs">
                          {isUpdating ? (
                            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <SelectValue />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="cashier">Caissier</SelectItem>
                          <SelectItem value="pending">En attente</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Info sur les rôles */}
        <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-muted rounded-lg">
          <h4 className="font-medium mb-2 text-sm">Permissions:</h4>
          <ul className="text-xs sm:text-sm text-muted-foreground space-y-1">
            <li><strong className="text-purple-600">Admin:</strong> Accès complet</li>
            <li><strong className="text-blue-600">Manager:</strong> Ventes, stock, rapports</li>
            <li><strong className="text-[#016124]">Caissier:</strong> Ventes uniquement</li>
            <li><strong className="text-[#CF761C]">En attente:</strong> Aucun accès</li>
          </ul>
        </div>
      </CardContent>
    </Card>
    </div>
  )
}
