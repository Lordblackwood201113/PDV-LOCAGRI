import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { toast } from 'sonner'
import { User, UserPlus, Search, X, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClientSelectorProps {
  selectedClientId: Id<'clients'> | null
  selectedClientName: string | null
  onSelect: (clientId: Id<'clients'> | null, clientName: string | null, clientReference: string | null) => void
  disabled?: boolean
}

export function ClientSelector({
  selectedClientId,
  selectedClientName,
  onSelect,
  disabled = false,
}: ClientSelectorProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newClient, setNewClient] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  })
  const [isCreating, setIsCreating] = useState(false)

  // Queries
  const searchResults = useQuery(
    api.clients.searchClients,
    searchQuery.trim().length >= 2 ? { query: searchQuery.trim() } : 'skip'
  )

  // Mutations
  const createClient = useMutation(api.clients.createClient)

  const handleSelectClient = (client: {
    _id: Id<'clients'>
    reference: string
    displayName: string
  }) => {
    onSelect(client._id, client.displayName, client.reference)
    setOpen(false)
    setSearchQuery('')
  }

  const handleClearClient = () => {
    onSelect(null, null, null)
  }

  const handleCreateClient = async () => {
    const hasFirstName = newClient.firstName.trim()
    const hasLastName = newClient.lastName.trim()
    const hasPhone = newClient.phone.trim()

    if (!hasFirstName && !hasLastName && !hasPhone) {
      toast.error('Veuillez renseigner au moins un champ')
      return
    }

    setIsCreating(true)
    try {
      const result = await createClient({
        firstName: hasFirstName || undefined,
        lastName: hasLastName || undefined,
        phone: hasPhone || undefined,
      })

      toast.success('Client créé', {
        description: `${result.displayName} (${result.reference})`,
      })

      onSelect(result.clientId, result.displayName, result.reference)
      setCreateDialogOpen(false)
      setOpen(false)
      setNewClient({ firstName: '', lastName: '', phone: '' })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'justify-start text-left font-normal h-9 px-3 flex-1',
                !selectedClientId && 'text-muted-foreground'
              )}
              disabled={disabled}
            >
              <User className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="truncate">
                {selectedClientName || 'Client (optionnel)'}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            {/* Search Input */}
            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm"
                  autoFocus
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-9 px-2"
                onClick={() => {
                  setCreateDialogOpen(true)
                  setOpen(false)
                }}
              >
                <UserPlus className="w-4 h-4" />
              </Button>
            </div>

            {/* Results */}
            <div className="max-h-48 overflow-y-auto">
              {searchQuery.trim().length < 2 ? (
                <p className="text-xs text-center text-gray-500 py-4">
                  Tapez au moins 2 caractères
                </p>
              ) : searchResults === undefined ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500 mb-2">Aucun client trouvé</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => {
                      setCreateDialogOpen(true)
                      setOpen(false)
                    }}
                  >
                    <UserPlus className="w-3 h-3 mr-1" />
                    Créer un client
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  {searchResults.map((client) => (
                    <button
                      key={client._id}
                      onClick={() => handleSelectClient(client)}
                      className={cn(
                        'w-full text-left p-2 rounded-md hover:bg-gray-100 transition-colors',
                        selectedClientId === client._id && 'bg-primary/10'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {client.displayName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {client.reference}
                            {client.phone && ` · ${client.phone}`}
                          </p>
                        </div>
                        {selectedClientId === client._id && (
                          <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {selectedClientId && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleClearClient}
            disabled={disabled}
            className="flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Create Client Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#016124]" />
              Nouveau client
            </DialogTitle>
            <DialogDescription>
              Renseignez au moins un champ (nom, prénom ou téléphone)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-sm">Prénom</Label>
                <Input
                  id="firstName"
                  value={newClient.firstName}
                  onChange={(e) => setNewClient({ ...newClient, firstName: e.target.value })}
                  placeholder="Jean"
                  disabled={isCreating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-sm">Nom</Label>
                <Input
                  id="lastName"
                  value={newClient.lastName}
                  onChange={(e) => setNewClient({ ...newClient, lastName: e.target.value })}
                  placeholder="Dupont"
                  disabled={isCreating}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm">Téléphone</Label>
              <Input
                id="phone"
                value={newClient.phone}
                onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                placeholder="77 123 45 67"
                disabled={isCreating}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={isCreating}
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreateClient}
              disabled={isCreating}
              className="bg-[#016124] hover:bg-[#017a2e]"
            >
              {isCreating ? (
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
    </>
  )
}
