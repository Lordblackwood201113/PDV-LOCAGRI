import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  Users,
  UserPlus,
  Search,
  Pencil,
  Archive,
  ArchiveRestore,
  Loader2,
  Phone,
  Mail,
} from 'lucide-react'

type ClientDoc = {
  _id: Id<'clients'>
  reference: string
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  notes?: string
  isActive: boolean
  createdAt: number
  createdByName: string
  displayName: string
}

export function ClientsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ClientDoc | null>(null)

  const currentUser = useQuery(api.users.getCurrentUser)
  const clients = useQuery(api.clients.getClients, { includeInactive: showArchived })

  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'manager'

  // Filtrage local par recherche
  const filteredClients = useMemo(() => {
    if (!clients) return []
    const q = searchQuery.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => {
      const first = (c.firstName || '').toLowerCase()
      const last = (c.lastName || '').toLowerCase()
      const phone = (c.phone || '').toLowerCase()
      const email = (c.email || '').toLowerCase()
      const ref = c.reference.toLowerCase()
      return (
        first.includes(q) ||
        last.includes(q) ||
        phone.includes(q) ||
        email.includes(q) ||
        ref.includes(q) ||
        `${first} ${last}`.includes(q)
      )
    })
  }, [clients, searchQuery])

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

  // Chargement
  if (currentUser === undefined || clients === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-3 sm:p-4">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-[#016124]" />
            Répertoire clients
          </h2>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-[#016124] hover:bg-[#017a2e]"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Nouveau client
          </Button>
        </div>

        {/* Barre de recherche + filtre */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Rechercher par nom, téléphone, référence..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={showArchived ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowArchived((v) => !v)}
                  className={showArchived ? 'bg-[#CF761C] hover:bg-[#CF761C]/90' : ''}
                >
                  <Archive className="w-4 h-4 mr-2" />
                  {showArchived ? 'Avec archivés' : 'Actifs seulement'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Liste */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-sm sm:text-base">
              {filteredClients.length} client
              {filteredClients.length > 1 ? 's' : ''}
              {searchQuery && ` correspondant à "${searchQuery}"`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            {filteredClients.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                {searchQuery
                  ? 'Aucun client trouvé pour cette recherche'
                  : 'Aucun client enregistré pour le moment'}
              </p>
            ) : (
              <div className="space-y-3">
                {filteredClients.map((client) => (
                  <ClientRow
                    key={client._id}
                    client={client as ClientDoc}
                    canEdit={canEdit}
                    onEdit={() => setEditTarget(client as ClientDoc)}
                    formatDate={formatDate}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateClientDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editTarget && canEdit && (
        <EditClientDialog
          client={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
        />
      )}
    </div>
  )
}

// ============================================
// Row
// ============================================

function ClientRow({
  client,
  canEdit,
  onEdit,
  formatDate,
}: {
  client: ClientDoc
  canEdit: boolean
  onEdit: () => void
  formatDate: (t: number) => string
}) {
  const deactivate = useMutation(api.clients.deactivateClient)
  const reactivate = useMutation(api.clients.reactivateClient)
  const [isToggling, setIsToggling] = useState(false)

  const handleToggleActive = async () => {
    setIsToggling(true)
    try {
      if (client.isActive) {
        await deactivate({ clientId: client._id })
        toast.success('Client archivé')
      } else {
        await reactivate({ clientId: client._id })
        toast.success('Client réactivé')
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: msg })
    } finally {
      setIsToggling(false)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 bg-[#016124]/10 rounded-full flex items-center justify-center text-[#016124] font-medium flex-shrink-0">
          {client.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm truncate">{client.displayName}</p>
            <Badge variant="secondary" className="text-[10px] font-mono">
              {client.reference}
            </Badge>
            {!client.isActive && (
              <Badge variant="outline" className="text-[10px] text-[#CF761C] border-[#CF761C]">
                Archivé
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {client.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3 h-3" /> {client.phone}
              </span>
            )}
            {client.email && (
              <span className="inline-flex items-center gap-1 truncate">
                <Mail className="w-3 h-3" /> {client.email}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Créé par {client.createdByName} le {formatDate(client.createdAt)}
          </p>
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            disabled={isToggling}
            className="h-8"
          >
            <Pencil className="w-3.5 h-3.5 mr-1" />
            Éditer
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleToggleActive}
            disabled={isToggling}
            className="h-8"
          >
            {isToggling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : client.isActive ? (
              <>
                <Archive className="w-3.5 h-3.5 mr-1" />
                Archiver
              </>
            ) : (
              <>
                <ArchiveRestore className="w-3.5 h-3.5 mr-1" />
                Restaurer
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

// ============================================
// Create dialog
// ============================================

function CreateClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createClient = useMutation(api.clients.createClient)
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', notes: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const reset = () => setForm({ firstName: '', lastName: '', phone: '', email: '', notes: '' })

  const handleSubmit = async () => {
    const first = form.firstName.trim()
    const last = form.lastName.trim()
    const phone = form.phone.trim()

    if (!first && !last && !phone) {
      toast.error('Veuillez renseigner au moins un champ (nom, prénom ou téléphone)')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await createClient({
        firstName: first || undefined,
        lastName: last || undefined,
        phone: phone || undefined,
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
      })
      toast.success('Client créé', {
        description: `${result.displayName} (${result.reference})`,
      })
      reset()
      onOpenChange(false)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: msg })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#016124]" />
            Nouveau client
          </DialogTitle>
          <DialogDescription>
            Renseignez au moins un nom, prénom ou téléphone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="create-firstName">Prénom</Label>
              <Input
                id="create-firstName"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="Jean"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-lastName">Nom</Label>
              <Input
                id="create-lastName"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="Dupont"
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-phone">Téléphone</Label>
            <Input
              id="create-phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="77 123 45 67"
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="jean@example.com"
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-notes">Notes</Label>
            <Input
              id="create-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Remarques..."
              disabled={isSubmitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-[#016124] hover:bg-[#017a2e]"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Création...
              </span>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Créer
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// Edit dialog
// ============================================

function EditClientDialog({
  client,
  open,
  onOpenChange,
}: {
  client: ClientDoc
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const updateClient = useMutation(api.clients.updateClient)
  const [form, setForm] = useState({
    firstName: client.firstName ?? '',
    lastName: client.lastName ?? '',
    phone: client.phone ?? '',
    email: client.email ?? '',
    notes: client.notes ?? '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await updateClient({
        clientId: client._id,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
      })
      toast.success('Client mis à jour')
      onOpenChange(false)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: msg })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-[#016124]" />
            Éditer {client.displayName}
          </DialogTitle>
          <DialogDescription>Référence {client.reference}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-firstName">Prénom</Label>
              <Input
                id="edit-firstName"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lastName">Nom</Label>
              <Input
                id="edit-lastName"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                disabled={isSubmitting}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-phone">Téléphone</Label>
            <Input
              id="edit-phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Input
              id="edit-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              disabled={isSubmitting}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-[#016124] hover:bg-[#017a2e]"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Enregistrement...
              </span>
            ) : (
              'Enregistrer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
