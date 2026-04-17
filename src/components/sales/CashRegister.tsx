import { useState, useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ClientSelector } from '@/components/clients'
import { toast } from 'sonner'
import type { Id } from '../../../convex/_generated/dataModel'
import { Banknote, Smartphone } from 'lucide-react'

type PaymentMethod = 'cash' | 'mobile_money'

export function CashRegister() {
  const [selectedProductId, setSelectedProductId] = useState<Id<'products'> | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Client (optionnel)
  const [selectedClientId, setSelectedClientId] = useState<Id<'clients'> | null>(null)
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null)
  const [selectedClientReference, setSelectedClientReference] = useState<string | null>(null)

  // Queries Convex
  const products = useQuery(api.products.getProducts)
  const todayStats = useQuery(api.sales.getTodayStats, {})

  // Mutation pour créer une vente
  const createSale = useMutation(api.sales.createSale)

  // Sélectionner le premier produit par défaut
  useEffect(() => {
    if (products && products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0]._id)
    }
  }, [products, selectedProductId])

  // Produit actuellement sélectionné
  const product = products?.find((p) => p._id === selectedProductId)

  // Gestion de la quantité
  const handleQuantityChange = (delta: number) => {
    const newQty = quantity + delta
    if (newQty >= 1 && newQty <= (product?.stockQuantity ?? 1)) {
      setQuantity(newQty)
    }
  }

  const handleQuantityInput = (value: number) => {
    if (value >= 1 && value <= (product?.stockQuantity ?? 1)) {
      setQuantity(value)
    }
  }

  // Changement de produit
  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId as Id<'products'>)
    setQuantity(1) // Réinitialiser la quantité
  }

  // Gestion du client
  const handleClientSelect = (
    clientId: Id<'clients'> | null,
    clientName: string | null,
    clientReference: string | null
  ) => {
    setSelectedClientId(clientId)
    setSelectedClientName(clientName)
    setSelectedClientReference(clientReference)
  }

  // Validation de la vente
  const handleSale = async () => {
    if (!product || !selectedProductId) return

    setIsSubmitting(true)
    try {
      const result = await createSale({
        productId: selectedProductId,
        quantity,
        paymentMethod,
        clientId: selectedClientId ?? undefined,
      })

      // Message de succès avec détails
      const clientInfo = result.clientName ? ` (${result.clientName})` : ''
      toast.success('Vente enregistrée', {
        description: `${result.saleReference}: ${quantity} ${result.unit}${quantity > 1 ? 's' : ''} de ${result.productName}${clientInfo} - ${formatPrice(result.total)}`,
      })

      // Alerte stock bas si nécessaire
      if (result.isLowStock) {
        toast.warning('Stock bas', {
          description: `Il reste ${result.newStock} ${result.unit}(s) de ${result.productName}`,
        })
      }

      // Réinitialiser le formulaire
      setQuantity(1)
      setSelectedClientId(null)
      setSelectedClientName(null)
      setSelectedClientReference(null)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Formatage du prix
  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
  }

  // État de chargement
  if (products === undefined) {
    return (
      <div className="p-3 sm:p-4 max-w-lg mx-auto">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-muted-foreground text-sm">Chargement...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Aucun produit configuré
  if (!products || products.length === 0) {
    return null // Géré par le parent (ProductSetup)
  }

  // Pas de produit sélectionné
  if (!product) {
    return (
      <div className="p-3 sm:p-4 max-w-lg mx-auto">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground text-sm">Sélectionnez un produit</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const total = product.price * quantity
  const isLowStock = product.stockQuantity <= product.alertThreshold
  const isCriticalStock = product.stockQuantity <= 5
  const canSell = product.stockQuantity >= quantity && !isSubmitting

  return (
    <div className="p-3 sm:p-4 max-w-lg mx-auto space-y-3 sm:space-y-4">
      {/* Sélecteur de produit (si plusieurs) */}
      {products.length > 1 && (
        <Card>
          <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm text-muted-foreground">Produit</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
            <Select value={selectedProductId ?? ''} onValueChange={handleProductChange}>
              <SelectTrigger className="w-full h-12 sm:h-14 text-base sm:text-lg">
                <SelectValue placeholder="Sélectionner un produit" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p._id} value={p._id} className="py-2 sm:py-3">
                    <div className="flex items-center justify-between w-full">
                      <span className="font-medium text-sm sm:text-base">{p.name}</span>
                      <span className="text-muted-foreground ml-2 sm:ml-4 text-xs sm:text-sm">
                        {formatPrice(p.price)} - Stock: {p.stockQuantity}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Info Produit & Stock */}
      <Card className={isCriticalStock ? 'border-red-400 bg-red-50' : isLowStock ? 'border-orange-400 bg-orange-50' : ''}>
        <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base sm:text-lg truncate">{product.name}</CardTitle>
            {isLowStock && (
              <Badge variant={isCriticalStock ? 'destructive' : 'outline'} className="text-[10px] sm:text-xs flex-shrink-0">
                {isCriticalStock ? 'Critique' : 'Stock bas'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Stock disponible</p>
              <p className={`text-xl sm:text-2xl font-bold ${isCriticalStock ? 'text-red-600' : isLowStock ? 'text-orange-600' : 'text-primary'}`}>
                {product.stockQuantity}
                <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">{product.unit}s</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs sm:text-sm text-muted-foreground">Prix unitaire</p>
              <p className="text-xl sm:text-2xl font-bold text-primary">
                {formatPrice(product.price)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sélection de la quantité */}
      <Card>
        <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
          <CardTitle className="text-xs sm:text-sm text-muted-foreground">Quantité</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            {/* Bouton moins */}
            <Button
              variant="outline"
              size="lg"
              className="h-12 w-12 sm:h-16 sm:w-16 text-2xl sm:text-3xl font-bold rounded-xl"
              onClick={() => handleQuantityChange(-1)}
              disabled={quantity <= 1 || isSubmitting}
            >
              −
            </Button>

            {/* Affichage quantité */}
            <div className="text-center min-w-[80px] sm:min-w-[100px]">
              <input
                type="number"
                value={quantity}
                onChange={(e) => handleQuantityInput(parseInt(e.target.value) || 1)}
                className="text-4xl sm:text-5xl font-bold text-center w-full bg-transparent border-none focus:outline-none focus:ring-0"
                min={1}
                max={product.stockQuantity}
                disabled={isSubmitting}
              />
              <p className="text-xs sm:text-sm text-muted-foreground">{product.unit}{quantity > 1 ? 's' : ''}</p>
            </div>

            {/* Bouton plus */}
            <Button
              variant="outline"
              size="lg"
              className="h-12 w-12 sm:h-16 sm:w-16 text-2xl sm:text-3xl font-bold rounded-xl"
              onClick={() => handleQuantityChange(1)}
              disabled={quantity >= product.stockQuantity || isSubmitting}
            >
              +
            </Button>
          </div>

          {/* Raccourcis quantité */}
          <div className="flex justify-center gap-1.5 sm:gap-2 mt-3 sm:mt-4">
            {[1, 5, 10].map((q) => (
              <Button
                key={q}
                variant={quantity === q ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleQuantityInput(q)}
                disabled={q > product.stockQuantity || isSubmitting}
                className="min-w-[40px] sm:min-w-[50px] text-xs sm:text-sm"
              >
                {q}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sélection du client (optionnel) */}
      <Card>
        <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
          <CardTitle className="text-xs sm:text-sm text-muted-foreground">Client (optionnel)</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <ClientSelector
            selectedClientId={selectedClientId}
            selectedClientName={selectedClientName}
            onSelect={handleClientSelect}
            disabled={isSubmitting}
          />
          {selectedClientReference && (
            <p className="text-xs text-gray-500 mt-1.5 ml-1">
              Réf: {selectedClientReference}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Mode de paiement */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Button
          variant={paymentMethod === 'cash' ? 'default' : 'outline'}
          className={`h-12 sm:h-16 text-sm sm:text-lg font-medium rounded-xl transition-all ${
            paymentMethod === 'cash'
              ? 'bg-primary ring-2 ring-primary ring-offset-2'
              : 'hover:bg-primary/5'
          }`}
          onClick={() => setPaymentMethod('cash')}
          disabled={isSubmitting}
        >
          <Banknote className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
          Espèces
        </Button>
        <Button
          variant={paymentMethod === 'mobile_money' ? 'default' : 'outline'}
          className={`h-12 sm:h-16 text-sm sm:text-lg font-medium rounded-xl transition-all ${
            paymentMethod === 'mobile_money'
              ? 'bg-primary ring-2 ring-primary ring-offset-2'
              : 'hover:bg-primary/5'
          }`}
          onClick={() => setPaymentMethod('mobile_money')}
          disabled={isSubmitting}
        >
          <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
          <span className="hidden sm:inline">Mobile Money</span>
          <span className="sm:hidden">Mobile</span>
        </Button>
      </div>

      {/* Total et Validation */}
      <Card className="bg-primary text-white overflow-hidden">
        <CardContent className="pt-4 sm:pt-6 pb-3 sm:pb-4 p-3 sm:p-6">
          {/* Affichage du total */}
          <div className="text-center mb-3 sm:mb-4">
            <p className="text-xs sm:text-sm opacity-80 mb-1">Total à payer</p>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight">
              {formatPrice(total)}
            </p>
          </div>

          {/* Bouton de validation */}
          <Button
            className="w-full h-12 sm:h-14 text-lg sm:text-xl font-bold bg-white text-primary hover:bg-gray-100 rounded-xl shadow-lg"
            onClick={handleSale}
            disabled={!canSell}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm sm:text-base">Enregistrement...</span>
              </span>
            ) : (
              'VALIDER LA VENTE'
            )}
          </Button>

          {/* Message d'erreur stock */}
          {product.stockQuantity < quantity && (
            <p className="text-center text-xs sm:text-sm mt-2 sm:mt-3 text-red-200">
              Stock insuffisant pour cette quantité
            </p>
          )}
        </CardContent>
      </Card>

      {/* Statistiques du jour (compact) */}
      {todayStats && (
        <Card>
          <CardHeader className="pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm text-muted-foreground">
              Vos ventes aujourd'hui
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
              <div>
                <p className="text-xl sm:text-2xl font-bold text-primary">{todayStats.salesCount}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">ventes</p>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold text-primary">{todayStats.totalQuantity}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">unités</p>
              </div>
              <div>
                <p className="text-base sm:text-lg font-bold text-primary">{formatPrice(todayStats.totalAmount)}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
