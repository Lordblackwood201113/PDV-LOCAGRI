import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  Vault,
  ArrowDownCircle,
  ArrowUpCircle,
  Settings,
  History,
  UserCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Banknote,
} from 'lucide-react'
import type { Id } from '../../../convex/_generated/dataModel'

export function SafeManagement() {
  const [initDialogOpen, setInitDialogOpen] = useState(false)
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [fundDialogOpen, setFundDialogOpen] = useState(false)
  const [depositDialogOpen, setDepositDialogOpen] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)

  const [initAmount, setInitAmount] = useState('')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [fundAmount, setFundAmount] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [depositNote, setDepositNote] = useState('')
  const [rejectReason, setRejectReason] = useState('')

  const [selectedFundRequest, setSelectedFundRequest] = useState<Id<'cashFundRequests'> | null>(null)
  const [selectedFundRequesterName, setSelectedFundRequesterName] = useState('')
  const [selectedDeposit, setSelectedDeposit] = useState<Id<'pendingDeposits'> | null>(null)
  const [selectedDepositExpected, setSelectedDepositExpected] = useState(0)
  const [selectedDepositCashierName, setSelectedDepositCashierName] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)

  const safeStatus = useQuery(api.safe.getSafeStatus)
  const transactions = useQuery(api.safe.getTransactionHistory, { limit: 20 })
  const pendingFundRequests = useQuery(api.safe.getPendingFundRequests)
  const pendingDeposits = useQuery(api.safe.getPendingDeposits)
  const currentUser = useQuery(api.users.getCurrentUser)

  const initializeSafe = useMutation(api.safe.initializeSafe)
  const adjustSafe = useMutation(api.safe.adjustSafe)
  const approveFundRequest = useMutation(api.safe.approveFundRequest)
  const rejectFundRequest = useMutation(api.safe.rejectFundRequest)
  const confirmDeposit = useMutation(api.safe.confirmDeposit)

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount)
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Handlers
  const handleInitialize = async () => {
    const amount = parseInt(initAmount.replace(/\D/g, ''))
    if (isNaN(amount) || amount < 0) {
      toast.error('Montant invalide')
      return
    }

    setIsSubmitting(true)
    try {
      await initializeSafe({ initialBalance: amount })
      toast.success('Coffre initialisé', {
        description: `Solde initial: ${formatPrice(amount)} FCFA`
      })
      setInitDialogOpen(false)
      setInitAmount('')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAdjust = async () => {
    const amount = parseInt(adjustAmount.replace(/[^\d-]/g, ''))
    if (isNaN(amount)) {
      toast.error('Montant invalide')
      return
    }
    if (!adjustReason.trim()) {
      toast.error('Motif requis')
      return
    }

    setIsSubmitting(true)
    try {
      await adjustSafe({ amount, reason: adjustReason.trim() })
      toast.success('Ajustement effectué')
      setAdjustDialogOpen(false)
      setAdjustAmount('')
      setAdjustReason('')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleApproveFund = async () => {
    if (!selectedFundRequest) return
    const amount = parseInt(fundAmount.replace(/\D/g, ''))
    if (isNaN(amount) || amount <= 0) {
      toast.error('Montant invalide')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await approveFundRequest({
        requestId: selectedFundRequest,
        amount
      })
      toast.success('Fond de caisse accordé', {
        description: `${formatPrice(amount)} FCFA pour ${result.cashierName}`
      })
      if (result.isLowBalance) {
        toast.warning('Attention', {
          description: 'Le solde du coffre est bas'
        })
      }
      setFundDialogOpen(false)
      setSelectedFundRequest(null)
      setFundAmount('')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRejectFund = async () => {
    if (!selectedFundRequest) return
    if (!rejectReason.trim()) {
      toast.error('Motif requis')
      return
    }

    setIsSubmitting(true)
    try {
      await rejectFundRequest({
        requestId: selectedFundRequest,
        reason: rejectReason.trim()
      })
      toast.success('Demande rejetée')
      setRejectDialogOpen(false)
      setSelectedFundRequest(null)
      setRejectReason('')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmDeposit = async () => {
    if (!selectedDeposit) return
    const amount = parseInt(depositAmount.replace(/\D/g, ''))
    if (isNaN(amount) || amount < 0) {
      toast.error('Montant invalide')
      return
    }

    const hasDiscrepancy = amount !== selectedDepositExpected
    if (hasDiscrepancy && !depositNote.trim()) {
      toast.error('Note explicative requise en cas d\'écart')
      return
    }

    setIsSubmitting(true)
    try {
      await confirmDeposit({
        depositId: selectedDeposit,
        actualAmount: amount,
        discrepancyNote: hasDiscrepancy ? depositNote.trim() : undefined
      })
      toast.success('Versement confirmé', {
        description: `${formatPrice(amount)} FCFA ajoutés au coffre`
      })
      setDepositDialogOpen(false)
      setSelectedDeposit(null)
      setDepositAmount('')
      setDepositNote('')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const openFundDialog = (requestId: Id<'cashFundRequests'>, requesterName: string) => {
    setSelectedFundRequest(requestId)
    setSelectedFundRequesterName(requesterName)
    setFundAmount('')
    setFundDialogOpen(true)
  }

  const openRejectDialog = (requestId: Id<'cashFundRequests'>) => {
    setSelectedFundRequest(requestId)
    setRejectReason('')
    setRejectDialogOpen(true)
  }

  const openDepositDialog = (depositId: Id<'pendingDeposits'>, expectedAmount: number, cashierName: string) => {
    setSelectedDeposit(depositId)
    setSelectedDepositExpected(expectedAmount)
    setSelectedDepositCashierName(cashierName)
    setDepositAmount(expectedAmount.toString())
    setDepositNote('')
    setDepositDialogOpen(true)
  }

  // Loading
  if (safeStatus === undefined || currentUser === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-[#016124] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Access check
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager')) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-4">
        <div className="text-center">
          <Vault className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">Accès réservé aux administrateurs et managers</p>
        </div>
      </div>
    )
  }

  // Safe not initialized
  if (!safeStatus) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-[#016124]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Vault className="w-8 h-8 text-[#016124]" />
            </div>
            <CardTitle>Initialiser le Coffre</CardTitle>
            <CardDescription>
              Le coffre n'est pas encore configuré. Définissez le solde initial pour commencer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {currentUser.role === 'admin' ? (
              <Button
                className="w-full bg-[#016124] hover:bg-[#017a2e]"
                onClick={() => setInitDialogOpen(true)}
              >
                Configurer le coffre
              </Button>
            ) : (
              <p className="text-center text-gray-500">
                Seul un administrateur peut initialiser le coffre.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Dialog d'initialisation */}
        <Dialog open={initDialogOpen} onOpenChange={setInitDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Initialiser le Coffre</DialogTitle>
              <DialogDescription>
                Entrez le solde initial du coffre-fort
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Solde initial (FCFA)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={initAmount ? formatPrice(parseInt(initAmount) || 0) : ''}
                  onChange={(e) => setInitAmount(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ex: 500 000"
                  className="text-xl text-center"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInitDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleInitialize}
                disabled={isSubmitting || !initAmount}
                className="bg-[#016124] hover:bg-[#017a2e]"
              >
                {isSubmitting ? 'Initialisation...' : 'Initialiser'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  const pendingFundCount = pendingFundRequests?.length || 0
  const pendingDepositCount = pendingDeposits?.length || 0

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold text-foreground">Gestion du Coffre</h2>

      {/* En-tête avec solde */}
      <div className="bg-gradient-to-r from-[#016124] to-[#017a2e] rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-14 sm:h-14 bg-white/20 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
              <Vault className="w-5 h-5 sm:w-7 sm:h-7" />
            </div>
            <div>
              <p className="text-white/80 text-xs sm:text-sm">Solde du Coffre</p>
              <p className="text-xl sm:text-3xl font-bold">{formatPrice(safeStatus.currentBalance)} FCFA</p>
            </div>
          </div>
          {currentUser.role === 'admin' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAdjustDialogOpen(true)}
              className="bg-white/20 hover:bg-white/30 text-white border-0 self-end sm:self-auto text-xs sm:text-sm h-8 sm:h-9"
            >
              <Settings className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Ajuster
            </Button>
          )}
        </div>
        <p className="text-[10px] sm:text-xs text-white/60 mt-2 sm:mt-3">
          Dernière mise à jour: {formatDate(safeStatus.lastUpdated)} par {safeStatus.updatedByName}
        </p>
      </div>

      {/* Demandes en attente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Demandes de fond de caisse */}
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <UserCheck className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124]" />
              <span className="truncate">Demandes de fond de caisse</span>
              {pendingFundCount > 0 && (
                <Badge className="bg-[#CF761C] ml-auto text-[10px] sm:text-xs">{pendingFundCount}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
            {pendingFundRequests?.length === 0 ? (
              <div className="text-center py-4 sm:py-6 text-gray-500">
                <Clock className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">Aucune demande en attente</p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {pendingFundRequests?.map((request) => (
                  <div
                    key={request._id}
                    className="p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 text-sm sm:text-base truncate">{request.requesterName}</span>
                      <span className="text-[10px] sm:text-xs text-gray-500 flex-shrink-0 ml-2">{formatTime(request.requestedAt)}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-[#7ABE4E] hover:bg-[#6aa842] text-xs sm:text-sm h-8"
                        onClick={() => openFundDialog(request._id, request.requesterName)}
                      >
                        <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                        <span className="hidden sm:inline">Donner fond</span>
                        <span className="sm:hidden">Donner</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 h-8 px-2 sm:px-3"
                        onClick={() => openRejectDialog(request._id)}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Versements en attente */}
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <ArrowUpCircle className="w-4 h-4 sm:w-5 sm:h-5 text-[#7ABE4E]" />
              <span className="truncate">Versements en attente</span>
              {pendingDepositCount > 0 && (
                <Badge className="bg-[#7ABE4E] ml-auto text-[10px] sm:text-xs">{pendingDepositCount}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
            {pendingDeposits?.length === 0 ? (
              <div className="text-center py-4 sm:py-6 text-gray-500">
                <Banknote className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">Aucun versement en attente</p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {pendingDeposits?.map((deposit) => (
                  <div
                    key={deposit._id}
                    className="p-3 sm:p-4 bg-[#7ABE4E]/10 rounded-lg border border-[#7ABE4E]/30"
                  >
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <span className="font-medium text-gray-900 text-sm sm:text-base truncate">{deposit.cashierName}</span>
                      <span className="font-bold text-[#016124] text-sm sm:text-base flex-shrink-0">
                        {formatPrice(deposit.expectedAmount)} F
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] sm:text-xs text-gray-500">
                        Clôturé à {formatTime(deposit.closedAt)}
                      </span>
                      <Button
                        size="sm"
                        className="bg-[#016124] hover:bg-[#017a2e] text-xs sm:text-sm h-8"
                        onClick={() => openDepositDialog(deposit._id, deposit.expectedAmount, deposit.cashierName)}
                      >
                        <ArrowUpCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                        Confirmer
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Historique des transactions */}
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <History className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            Historique des mouvements
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          {transactions?.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-gray-500">
              <p className="text-sm">Aucune transaction enregistrée</p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {transactions?.map((tx) => (
                <div
                  key={tx._id}
                  className="p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5 sm:mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {tx.type === 'initial' && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] sm:text-xs">
                          Initial
                        </Badge>
                      )}
                      {tx.type === 'withdrawal' && (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px] sm:text-xs">
                          <ArrowDownCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                          Retrait
                        </Badge>
                      )}
                      {tx.type === 'deposit' && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] sm:text-xs">
                          <ArrowUpCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                          Dépôt
                        </Badge>
                      )}
                      {tx.type === 'adjustment' && (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px] sm:text-xs">
                          Ajustement
                        </Badge>
                      )}
                      <span className="text-[10px] sm:text-xs text-gray-500">
                        {formatDate(tx.date)}
                      </span>
                    </div>
                    <span className={`font-semibold text-sm sm:text-base flex-shrink-0 ${
                      tx.type === 'withdrawal' ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {tx.type === 'withdrawal' ? '-' : '+'}{formatPrice(tx.amount)} F
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 truncate">{tx.reason}</p>
                  <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">Par: {tx.performedByName}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog d'ajustement */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajuster le Coffre</DialogTitle>
            <DialogDescription>
              Entrez un montant positif pour ajouter, négatif pour retirer
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Montant (FCFA)</Label>
              <Input
                type="text"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="Ex: 50000 ou -10000"
                className="text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label>Motif *</Label>
              <Textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Ex: Inventaire physique, correction d'erreur..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleAdjust}
              disabled={isSubmitting || !adjustAmount || !adjustReason.trim()}
              className="bg-[#016124] hover:bg-[#017a2e]"
            >
              {isSubmitting ? 'Ajustement...' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog d'approbation de fond */}
      <Dialog open={fundDialogOpen} onOpenChange={setFundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Donner un fond de caisse</DialogTitle>
            <DialogDescription>
              Fond de caisse pour {selectedFundRequesterName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Solde actuel du coffre</span>
                <span className="font-medium">{formatPrice(safeStatus.currentBalance)} FCFA</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Montant du fond de caisse (FCFA) *</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={fundAmount ? formatPrice(parseInt(fundAmount) || 0) : ''}
                onChange={(e) => setFundAmount(e.target.value.replace(/\D/g, ''))}
                placeholder="Ex: 50 000"
                className="text-xl text-center"
              />
            </div>
            {fundAmount && parseInt(fundAmount) > safeStatus.currentBalance && (
              <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg text-orange-700 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>Le montant dépasse le solde du coffre</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFundDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleApproveFund}
              disabled={isSubmitting || !fundAmount}
              className="bg-[#7ABE4E] hover:bg-[#6aa842]"
            >
              {isSubmitting ? 'Validation...' : 'Valider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de rejet */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la demande</DialogTitle>
            <DialogDescription>
              Indiquez le motif du rejet
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex: Pas assez de fonds disponibles..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectFund}
              disabled={isSubmitting || !rejectReason.trim()}
            >
              {isSubmitting ? 'Rejet...' : 'Rejeter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmation de versement */}
      <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer le versement</DialogTitle>
            <DialogDescription>
              Versement de {selectedDepositCashierName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Montant attendu</span>
                <span className="font-medium">{formatPrice(selectedDepositExpected)} FCFA</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Montant réellement reçu (FCFA) *</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={depositAmount ? formatPrice(parseInt(depositAmount) || 0) : ''}
                onChange={(e) => setDepositAmount(e.target.value.replace(/\D/g, ''))}
                className="text-xl text-center"
              />
            </div>
            {depositAmount && parseInt(depositAmount) !== selectedDepositExpected && (
              <>
                <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg text-orange-700 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Écart de {formatPrice(parseInt(depositAmount) - selectedDepositExpected)} FCFA
                  </span>
                </div>
                <div className="space-y-2">
                  <Label>Note explicative *</Label>
                  <Textarea
                    value={depositNote}
                    onChange={(e) => setDepositNote(e.target.value)}
                    placeholder="Expliquez la raison de l'écart..."
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleConfirmDeposit}
              disabled={isSubmitting || !depositAmount || (parseInt(depositAmount) !== selectedDepositExpected && !depositNote.trim())}
              className="bg-[#016124] hover:bg-[#017a2e]"
            >
              {isSubmitting ? 'Confirmation...' : 'Confirmer le versement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
