import { useState, useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Minus, Plus, Banknote, Smartphone, Notebook, ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Id } from '../../../convex/_generated/dataModel'
import { ClientSelector } from '@/components/clients'

type PaymentMethod = 'cash' | 'mobile_money' | 'credit'

export function QuickSalePanel() {
  const [selectedProductId, setSelectedProductId] = useState<Id<'products'> | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<Id<'clients'> | null>(null)
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null)
  const [amountReceived, setAmountReceived] = useState<number | ''>('')
  // La monnaie ne peut être rendue qu'en espèces ou Mobile Money (jamais "crédit")
  const [changeMethod, setChangeMethod] = useState<'cash' | 'mobile_money'>('cash')

  const products = useQuery(api.products.getProducts)
  const createSale = useMutation(api.sales.createSale)
  const selectedClient = useQuery(
    api.clients.getClient,
    selectedClientId ? { clientId: selectedClientId } : 'skip'
  )

  // Sélectionner le premier produit par défaut
  useEffect(() => {
    if (products && products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0]._id)
    }
  }, [products, selectedProductId])

  const product = products?.find((p) => p._id === selectedProductId)

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount)
  }

  const handleQuantityChange = (delta: number) => {
    const newQty = quantity + delta
    if (newQty >= 1 && newQty <= (product?.stockQuantity ?? 1)) {
      setQuantity(newQty)
    }
  }

  const handleSale = async () => {
    if (!product || !selectedProductId) return

    const saleTotal = product.price * quantity
    const received =
      paymentMethod === 'cash' && typeof amountReceived === 'number' ? amountReceived : undefined
    const changeBack = received !== undefined ? received - saleTotal : 0
    const effectiveChangeMethod =
      paymentMethod === 'cash' && changeBack > 0 ? changeMethod : undefined

    setIsSubmitting(true)
    try {
      const result = await createSale({
        productId: selectedProductId,
        quantity,
        paymentMethod,
        clientId: selectedClientId ?? undefined,
        amountReceived: received,
        changeMethod: effectiveChangeMethod,
      })

      const clientSuffix = selectedClientName ? ` · ${selectedClientName}` : ''

      toast.success('Vente enregistrée', {
        description: `${quantity} x ${result.productName} = ${formatPrice(result.total)} FCFA${clientSuffix}`,
      })

      if (result.changeDue && result.changeDue > 0) {
        const methodLabel = result.changeMethod === 'mobile_money' ? 'Mobile Money' : 'Espèces'
        toast.info('Monnaie à rendre', {
          description: `${formatPrice(result.changeDue)} FCFA · ${methodLabel}`,
        })
      }

      if (result.isCredit && result.clientBalanceAfter !== undefined) {
        toast.info('Vente à crédit', {
          description: `${selectedClientName ?? 'Client'} doit maintenant ${formatPrice(result.clientBalanceAfter)} FCFA`,
        })
      }

      if (result.isLowStock) {
        toast.warning('Stock bas', {
          description: `Il reste ${result.newStock} ${result.unit}(s)`,
        })
      }

      setQuantity(1)
      setSelectedClientId(null)
      setSelectedClientName(null)
      setAmountReceived('')
      setChangeMethod('cash')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!products || products.length === 0 || !product) {
    return (
      <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-100">
        <p className="text-gray-500 text-center text-sm sm:text-base">Aucun produit disponible</p>
      </div>
    )
  }

  const total = product.price * quantity
  const changeDue =
    paymentMethod === 'cash' && typeof amountReceived === 'number' ? amountReceived - total : 0
  const insufficient =
    paymentMethod === 'cash' && typeof amountReceived === 'number' && amountReceived < total
  const cashPaymentReady =
    paymentMethod !== 'cash' || (typeof amountReceived === 'number' && amountReceived >= total)
  const creditReady = paymentMethod !== 'credit' || selectedClientId !== null
  const canSell =
    product.stockQuantity >= quantity && cashPaymentReady && creditReady && !isSubmitting

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-50">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm sm:text-base">
          <ShoppingBag className="w-4 h-4 text-[#016124]" />
          Nouvelle Vente
        </h3>
      </div>

      <div className="p-4 sm:p-5 space-y-4 sm:space-y-5">
        {/* Sélection produit */}
        {products.length > 1 && (
          <div className="space-y-2">
            <label className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide">
              Produit
            </label>
            <div className="grid grid-cols-2 gap-2">
              {products.slice(0, 4).map((p) => (
                <button
                  key={p._id}
                  onClick={() => {
                    setSelectedProductId(p._id)
                    setQuantity(1)
                    setAmountReceived('')
                  }}
                  disabled={isSubmitting}
                  className={cn(
                    'p-2 sm:p-3 rounded-lg border-2 text-left transition-all',
                    selectedProductId === p._id
                      ? 'border-[#7ABE4E] bg-[#7ABE4E]/5'
                      : 'border-gray-100 hover:border-gray-200 bg-white'
                  )}
                >
                  <p className="font-medium text-xs sm:text-sm text-gray-900 truncate">{p.name}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500">{formatPrice(p.price)} F</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Produit sélectionné (si un seul) */}
        {products.length === 1 && (
          <div className="p-3 sm:p-4 bg-gray-50/50 rounded-lg border border-gray-100">
            <p className="font-semibold text-gray-900 text-sm sm:text-base">{product.name}</p>
            <p className="text-xs sm:text-sm text-gray-500">{formatPrice(product.price)} FCFA / {product.unit}</p>
            <p className={cn(
              'text-[10px] sm:text-xs mt-1',
              product.stockQuantity <= product.alertThreshold ? 'text-[#CF761C]' : 'text-gray-400'
            )}>
              Stock: {product.stockQuantity} {product.unit}s
            </p>
          </div>
        )}

        {/* Quantité */}
        <div className="space-y-2">
          <label className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide">
            Quantité
          </label>
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl border-gray-200"
              onClick={() => handleQuantityChange(-1)}
              disabled={quantity <= 1 || isSubmitting}
            >
              <Minus className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>

            <div className="w-16 sm:w-20 text-center">
              <span className="text-3xl sm:text-4xl font-bold text-gray-900">{quantity}</span>
              <p className="text-[10px] sm:text-xs text-gray-400">{product.unit}s</p>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl border-gray-200"
              onClick={() => handleQuantityChange(1)}
              disabled={quantity >= product.stockQuantity || isSubmitting}
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          </div>

          {/* Raccourcis */}
          <div className="flex justify-center gap-1.5 sm:gap-2 mt-2">
            {[1, 5, 10].map((q) => (
              <Button
                key={q}
                variant={quantity === q ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setQuantity(Math.min(q, product.stockQuantity))}
                disabled={q > product.stockQuantity || isSubmitting}
                className={cn(
                  'text-xs h-8 px-3',
                  quantity === q && 'bg-[#016124] hover:bg-[#017a2e]'
                )}
              >
                {q}
              </Button>
            ))}
          </div>
        </div>

        {/* Client (optionnel) */}
        <div className="space-y-2">
          <label className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide">
            Client
          </label>
          <ClientSelector
            selectedClientId={selectedClientId}
            selectedClientName={selectedClientName}
            onSelect={(clientId, clientName) => {
              setSelectedClientId(clientId)
              setSelectedClientName(clientName)
            }}
            disabled={isSubmitting}
          />
        </div>

        {/* Paiement */}
        <div className="space-y-2">
          <label className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide">
            Paiement
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setPaymentMethod('cash')}
              disabled={isSubmitting}
              className={cn(
                'flex items-center justify-center gap-1.5 p-2.5 sm:p-3 rounded-lg border-2 transition-all',
                paymentMethod === 'cash'
                  ? 'border-[#7ABE4E] bg-[#7ABE4E]/5 text-[#016124]'
                  : 'border-gray-100 text-gray-600 hover:border-gray-200 bg-white'
              )}
            >
              <Banknote className="w-4 h-4" />
              <span className="font-medium text-xs sm:text-sm">Espèces</span>
            </button>
            <button
              onClick={() => {
                setPaymentMethod('mobile_money')
                setAmountReceived('')
              }}
              disabled={isSubmitting}
              className={cn(
                'flex items-center justify-center gap-1.5 p-2.5 sm:p-3 rounded-lg border-2 transition-all',
                paymentMethod === 'mobile_money'
                  ? 'border-[#CF761C] bg-[#CF761C]/5 text-[#CF761C]'
                  : 'border-gray-100 text-gray-600 hover:border-gray-200 bg-white'
              )}
            >
              <Smartphone className="w-4 h-4" />
              <span className="font-medium text-xs sm:text-sm">Mobile</span>
            </button>
            <button
              onClick={() => {
                setPaymentMethod('credit')
                setAmountReceived('')
              }}
              disabled={isSubmitting}
              className={cn(
                'flex items-center justify-center gap-1.5 p-2.5 sm:p-3 rounded-lg border-2 transition-all',
                paymentMethod === 'credit'
                  ? 'border-[#7C3AED] bg-[#7C3AED]/5 text-[#7C3AED]'
                  : 'border-gray-100 text-gray-600 hover:border-gray-200 bg-white'
              )}
            >
              <Notebook className="w-4 h-4" />
              <span className="font-medium text-xs sm:text-sm">Crédit</span>
            </button>
          </div>

          {paymentMethod === 'credit' && (
            <p className="text-xs text-[#CF761C] pt-1">
              {!selectedClientId
                ? 'Sélectionnez un client pour la vente à crédit.'
                : (selectedClient?.balance ?? 0) > 0
                  ? `Ce client doit déjà ${formatPrice(selectedClient?.balance ?? 0)} FCFA.`
                  : null}
            </p>
          )}
        </div>

        {/* Montant reçu & monnaie (paiement espèces uniquement) */}
        {paymentMethod === 'cash' && (
          <div className="space-y-2">
            <label className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide">
              Montant reçu
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={amountReceived}
              onChange={(e) =>
                setAmountReceived(e.target.value === '' ? '' : Number(e.target.value))
              }
              placeholder={`Ex: ${total}`}
              disabled={isSubmitting}
              className="w-full h-10 sm:h-11 rounded-lg border border-gray-200 px-3 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#7ABE4E]/40"
            />

            {/* Raccourcis billets */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAmountReceived(total)}
                disabled={isSubmitting}
                className="text-xs h-8 px-3 border border-gray-100"
              >
                Compte juste
              </Button>
              {[500, 1000, 2000, 5000, 10000].map((b) => (
                <Button
                  key={b}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAmountReceived(b)}
                  disabled={isSubmitting}
                  className="text-xs h-8 px-3 border border-gray-100"
                >
                  {formatPrice(b)}
                </Button>
              ))}
            </div>

            {/* Monnaie à rendre */}
            {typeof amountReceived === 'number' &&
              (insufficient ? (
                <p className="text-sm font-medium text-red-600">Montant insuffisant</p>
              ) : (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-gray-500 text-sm">Monnaie à rendre</span>
                  <span className="text-xl sm:text-2xl font-bold text-[#016124]">
                    {formatPrice(Math.max(0, changeDue))}{' '}
                    <span className="text-xs font-normal text-gray-400">F</span>
                  </span>
                </div>
              ))}

            {/* Moyen de rendu de la monnaie */}
            {changeDue > 0 && !insufficient && (
              <div className="space-y-1.5">
                <label className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Rendre la monnaie en
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChangeMethod('cash')}
                    disabled={isSubmitting}
                    className={cn(
                      'flex items-center justify-center gap-1.5 p-2.5 rounded-lg border-2 transition-all',
                      changeMethod === 'cash'
                        ? 'border-[#7ABE4E] bg-[#7ABE4E]/5 text-[#016124]'
                        : 'border-gray-100 text-gray-600 hover:border-gray-200 bg-white'
                    )}
                  >
                    <Banknote className="w-4 h-4" />
                    <span className="font-medium text-xs sm:text-sm">Espèces</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChangeMethod('mobile_money')}
                    disabled={isSubmitting}
                    className={cn(
                      'flex items-center justify-center gap-1.5 p-2.5 rounded-lg border-2 transition-all',
                      changeMethod === 'mobile_money'
                        ? 'border-[#CF761C] bg-[#CF761C]/5 text-[#CF761C]'
                        : 'border-gray-100 text-gray-600 hover:border-gray-200 bg-white'
                    )}
                  >
                    <Smartphone className="w-4 h-4" />
                    <span className="font-medium text-xs sm:text-sm">Mobile Money</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Total */}
        <div className="pt-3 sm:pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <span className="text-gray-500 text-sm">Total</span>
            <span className="text-xl sm:text-2xl font-bold text-gray-900">
              {formatPrice(total)} <span className="text-xs sm:text-sm font-normal text-gray-400">F</span>
            </span>
          </div>

          <Button
            className="w-full h-10 sm:h-12 text-sm sm:text-base font-semibold bg-[#016124] hover:bg-[#017a2e]"
            onClick={handleSale}
            disabled={!canSell}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Enregistrement...
              </span>
            ) : (
              'Valider la vente'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
