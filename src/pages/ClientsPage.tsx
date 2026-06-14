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
import { cn } from '@/lib/utils'
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
  MapPin,
  Wallet,
  Banknote,
  Smartphone,
  HandCoins,
} from 'lucide-react'

type ClientDoc = {
  _id: Id<'clients'>
  reference: string
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
  quartier?: string
  notes?: string
  balance?: number
  type?: 'particulier' | 'grossiste'
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
  const [payTarget, setPayTarget] = useState<ClientDoc | null>(null)

  const currentUser = useQuery(api.users.getCurrentUser)
  const clients = useQuery(api.clients.getClients, { includeInactive: showArchived })
  const receivables = useQuery(api.clients.getReceivables)

  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'manager'

  const formatPrice = (amount: number) => new Intl.NumberFormat('fr-FR').format(amount)

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
      const quartier = (c.quartier || '').toLowerCase()
      const ref = c.reference.toLowerCase()
      return (
        first.includes(q) ||
        last.includes(q) ||
        phone.includes(q) ||
        email.includes(q) ||
        quartier.includes(q) ||
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
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-locagri-primary" />
            Répertoire clients
          </h2>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-locagri-primary hover:bg-locagri-primary-light"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Nouveau client
          </Button>
        </div>

        {/* Récap des créances */}
        {receivables && receivables.totalOutstanding > 0 && (
          <Card className="border-locagri-accent/30 bg-locagri-accent/5">
            <CardContent className="p-3 sm:p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-locagri-accent/15 flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5 text-locagri-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Total des créances</p>
                  <p className="text-lg sm:text-xl font-bold text-locagri-accent">
                    {formatPrice(receivables.totalOutstanding)} FCFA
                  </p>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground text-right shrink-0">
                {receivables.debtorCount} client{receivables.debtorCount > 1 ? 's' : ''} débiteur
                {receivables.debtorCount > 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Barre de recherche + filtre */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Rechercher par nom, téléphone, quartier, référence..."
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
                  className={showArchived ? 'bg-locagri-accent hover:bg-locagri-accent/90' : ''}
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
                    onPay={() => setPayTarget(client as ClientDoc)}
                    formatDate={formatDate}
                    formatPrice={formatPrice}
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
      {payTarget && (
        <RecordPaymentDialog
          client={payTarget}
          open={!!payTarget}
          onOpenChange={(open) => !open && setPayTarget(null)}
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
  onPay,
  formatDate,
  formatPrice,
}: {
  client: ClientDoc
  canEdit: boolean
  onEdit: () => void
  onPay: () => void
  formatDate: (t: number) => string
  formatPrice: (n: number) => string
}) {
  const hasDebt = (client.balance ?? 0) > 0
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
        <div className="w-10 h-10 bg-locagri-primary/10 rounded-full flex items-center justify-center text-locagri-primary font-medium shrink-0">
          {client.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm truncate">{client.displayName}</p>
            <Badge variant="secondary" className="text-[10px] font-mono">
              {client.reference}
            </Badge>
            <Badge
              variant="outline"
              className={`text-[10px] ${
                client.type === 'grossiste'
                  ? 'text-locagri-primary border-locagri-primary'
                  : 'text-gray-500 border-gray-300'
              }`}
            >
              {client.type === 'grossiste' ? 'Grossiste' : 'Particulier'}
            </Badge>
            {!client.isActive && (
              <Badge variant="outline" className="text-[10px] text-locagri-accent border-locagri-accent">
                Archivé
              </Badge>
            )}
            {hasDebt && (
              <Badge className="text-[10px] bg-locagri-accent/10 text-locagri-accent border border-locagri-accent/30 hover:bg-locagri-accent/10">
                Doit {formatPrice(client.balance ?? 0)} FCFA
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
            {client.quartier && (
              <span className="inline-flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3" /> {client.quartier}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Créé par {client.createdByName} le {formatDate(client.createdAt)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
        {hasDebt && (
          <Button
            size="sm"
            onClick={onPay}
            disabled={isToggling}
            className="h-8 bg-locagri-accent hover:bg-locagri-accent/90 text-white"
          >
            <HandCoins className="w-3.5 h-3.5 mr-1" />
            Règlement
          </Button>
        )}
        {canEdit && (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}

// ============================================
// Sélecteur de type (réutilisé création / édition)
// ============================================

function ClientTypeToggle({
  value,
  onChange,
  disabled,
}: {
  value: 'particulier' | 'grossiste'
  onChange: (t: 'particulier' | 'grossiste') => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label>Type de client</Label>
      <div className="grid grid-cols-2 gap-2">
        {(['particulier', 'grossiste'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            disabled={disabled}
            className={`p-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
              value === t
                ? 'border-locagri-primary bg-locagri-primary/5 text-locagri-primary'
                : 'border-gray-100 text-gray-600 hover:border-gray-200 bg-white'
            }`}
          >
            {t === 'particulier' ? 'Particulier' : 'Grossiste'}
          </button>
        ))}
      </div>
      {value === 'grossiste' && (
        <p className="text-[10px] text-muted-foreground">
          Le prix est saisi librement lors de chaque vente.
        </p>
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
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', quartier: '', notes: '', type: 'particulier' as 'particulier' | 'grossiste' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const reset = () => setForm({ firstName: '', lastName: '', phone: '', email: '', quartier: '', notes: '', type: 'particulier' as 'particulier' | 'grossiste' })

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
        quartier: form.quartier.trim() || undefined,
        notes: form.notes.trim() || undefined,
        type: form.type,
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
      <DialogContent className="sm:max-w-110">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-locagri-primary" />
            Nouveau client
          </DialogTitle>
          <DialogDescription>
            Renseignez au moins un nom, prénom ou téléphone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <ClientTypeToggle
            value={form.type}
            onChange={(t) => setForm({ ...form, type: t })}
            disabled={isSubmitting}
          />
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
            <Label htmlFor="create-quartier">Quartier</Label>
            <Input
              id="create-quartier"
              value={form.quartier}
              onChange={(e) => setForm({ ...form, quartier: e.target.value })}
              placeholder="Cocody, Yopougon, Plateau..."
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
            className="bg-locagri-primary hover:bg-locagri-primary-light"
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
    quartier: client.quartier ?? '',
    notes: client.notes ?? '',
    type: (client.type ?? 'particulier') as 'particulier' | 'grossiste',
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
        quartier: form.quartier.trim() || undefined,
        notes: form.notes.trim() || undefined,
        type: form.type,
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
      <DialogContent className="sm:max-w-110">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-locagri-primary" />
            Éditer {client.displayName}
          </DialogTitle>
          <DialogDescription>Référence {client.reference}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <ClientTypeToggle
            value={form.type}
            onChange={(t) => setForm({ ...form, type: t })}
            disabled={isSubmitting}
          />
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
            <Label htmlFor="edit-quartier">Quartier</Label>
            <Input
              id="edit-quartier"
              value={form.quartier}
              onChange={(e) => setForm({ ...form, quartier: e.target.value })}
              placeholder="Cocody, Yopougon, Plateau..."
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
            className="bg-locagri-primary hover:bg-locagri-primary-light"
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

// ============================================
// Record payment dialog (règlement de créance)
// ============================================

function RecordPaymentDialog({
  client,
  open,
  onOpenChange,
}: {
  client: ClientDoc
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const recordPayment = useMutation(api.clients.recordClientPayment)
  const ledger = useQuery(api.clients.getClientLedger, { clientId: client._id })
  const [amount, setAmount] = useState<number | ''>('')
  const [method, setMethod] = useState<'cash' | 'mobile_money'>('cash')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const balance = ledger?.client.balance ?? client.balance ?? 0
  const formatPrice = (n: number) => new Intl.NumberFormat('fr-FR').format(n)
  const formatDate = (t: number) =>
    new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })

  const invalid = typeof amount !== 'number' || amount <= 0 || amount > balance

  const handleSubmit = async () => {
    if (typeof amount !== 'number' || invalid) return
    setIsSubmitting(true)
    try {
      const result = await recordPayment({
        clientId: client._id,
        amount,
        method,
        note: note.trim() || undefined,
      })
      toast.success('Règlement enregistré', {
        description: `${formatPrice(amount)} FCFA · Reste dû: ${formatPrice(result.balanceAfter)} FCFA`,
      })
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
      <DialogContent className="sm:max-w-110">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="w-5 h-5 text-locagri-accent" />
            Encaisser un règlement
          </DialogTitle>
          <DialogDescription>
            {client.displayName} · {client.reference}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Encours */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-locagri-accent/5 border border-locagri-accent/20">
            <span className="text-sm text-muted-foreground">Encours actuel</span>
            <span className="text-lg font-bold text-locagri-accent">{formatPrice(balance)} FCFA</span>
          </div>

          {/* Montant */}
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Montant du règlement (FCFA)</Label>
            <Input
              id="pay-amount"
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder={`Max: ${balance}`}
              disabled={isSubmitting}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2 border border-gray-100"
              onClick={() => setAmount(balance)}
              disabled={isSubmitting}
            >
              Solder ({formatPrice(balance)})
            </Button>
            {typeof amount === 'number' && amount > balance && (
              <p className="text-xs text-red-600">Le montant dépasse l'encours.</p>
            )}
          </div>

          {/* Méthode */}
          <div className="space-y-2">
            <Label>Moyen de règlement</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod('cash')}
                disabled={isSubmitting}
                className={cn(
                  'flex items-center justify-center gap-1.5 p-2.5 rounded-lg border-2 transition-all',
                  method === 'cash'
                    ? 'border-locagri-success bg-locagri-success/5 text-locagri-primary'
                    : 'border-gray-100 text-gray-600 hover:border-gray-200 bg-white'
                )}
              >
                <Banknote className="w-4 h-4" />
                <span className="font-medium text-xs sm:text-sm">Espèces</span>
              </button>
              <button
                type="button"
                onClick={() => setMethod('mobile_money')}
                disabled={isSubmitting}
                className={cn(
                  'flex items-center justify-center gap-1.5 p-2.5 rounded-lg border-2 transition-all',
                  method === 'mobile_money'
                    ? 'border-locagri-accent bg-locagri-accent/5 text-locagri-accent'
                    : 'border-gray-100 text-gray-600 hover:border-gray-200 bg-white'
                )}
              >
                <Smartphone className="w-4 h-4" />
                <span className="font-medium text-xs sm:text-sm">Mobile Money</span>
              </button>
            </div>
            {method === 'cash' && (
              <p className="text-[10px] text-muted-foreground">
                Nécessite une caisse ouverte ; entre dans votre caisse du jour.
              </p>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="pay-note">Note (optionnel)</Label>
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Remarque..."
              disabled={isSubmitting}
            />
          </div>

          {/* Ardoise compacte */}
          {ledger && (ledger.creditSales.length > 0 || ledger.payments.length > 0) && (
            <div className="space-y-1.5 max-h-40 overflow-auto rounded-lg border border-gray-100 p-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">
                Ardoise récente
              </p>
              {ledger.creditSales.slice(0, 4).map((s) => (
                <div key={s._id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 truncate">
                    {formatDate(s.date)} · {s.productName}
                    {s.paymentStatus === 'paid' && <span className="text-locagri-primary"> · soldé</span>}
                  </span>
                  <span className="text-gray-900 tabular-nums">
                    {s.paymentStatus === 'paid' ? formatPrice(s.total) : formatPrice(s.amountDue)} F
                  </span>
                </div>
              ))}
              {ledger.payments.slice(0, 4).map((p) => (
                <div key={p._id} className="flex items-center justify-between text-xs">
                  <span className="text-locagri-primary truncate">
                    {formatDate(p.date)} · Règlement {p.method === 'cash' ? 'espèces' : 'Mobile'}
                  </span>
                  <span className="text-locagri-primary tabular-nums">−{formatPrice(p.amount)} F</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || invalid}
            className="bg-locagri-accent hover:bg-locagri-accent/90 text-white"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Enregistrement...
              </span>
            ) : (
              <>
                <HandCoins className="w-4 h-4 mr-2" />
                Encaisser
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
