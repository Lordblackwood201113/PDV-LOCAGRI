import { useState, useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { Id } from '../../../convex/_generated/dataModel'
import { ClipboardEdit } from 'lucide-react'

interface AdjustStockFormProps {
  onSuccess?: () => void
}

export function AdjustStockForm({ onSuccess }: AdjustStockFormProps) {
  const [selectedProductId, setSelectedProductId] = useState<Id<'products'> | ''>('')
  const [newQuantity, setNewQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const products = useQuery(api.products.getProducts)
  const adjustStock = useMutation(api.stock.adjustStock)

  const selectedProduct = products?.find((p) => p._id === selectedProductId)

  // Réinitialiser la quantité quand le produit change
  useEffect(() => {
    setNewQuantity('')
  }, [selectedProductId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedProductId) {
      toast.error('Veuillez sélectionner un produit')
      return
    }

    const qty = parseInt(newQuantity)

    if (isNaN(qty) || qty < 0) {
      toast.error('La quantité doit être un nombre positif ou zéro')
      return
    }

    if (!reason.trim()) {
      toast.error('Le motif est requis pour un ajustement')
      return
    }

    if (selectedProduct && qty === selectedProduct.stockQuantity) {
      toast.info('Le stock est déjà à cette valeur')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await adjustStock({
        productId: selectedProductId as Id<'products'>,
        newQuantity: qty,
        reason: reason.trim(),
      })

      const diff = result.difference
      toast.success('Stock ajusté', {
        description: `${diff >= 0 ? '+' : ''}${diff} ${result.unit}(s) pour ${result.productName}. Nouveau stock: ${result.newStock}`,
      })

      // Réinitialiser le formulaire
      setNewQuantity('')
      setReason('')
      onSuccess?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Motifs prédéfinis pour ajustement
  const quickReasons = [
    'Inventaire physique',
    'Correction erreur',
    'Perte/Casse',
    'Vol constaté',
  ]

  if (products === undefined) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-muted-foreground">Chargement...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!products || products.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Aucun produit configuré
        </CardContent>
      </Card>
    )
  }

  const currentStock = selectedProduct?.stockQuantity ?? 0

  return (
    <Card className="border-orange-200">
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <ClipboardEdit className="w-4 h-4 sm:w-5 sm:h-5 text-[#CF761C]" />
          Ajustement d'inventaire
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Corriger le stock après un inventaire physique
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          {/* Sélection du produit */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="adjust-product" className="text-sm">Produit</Label>
            <Select
              value={selectedProductId}
              onValueChange={(value) => setSelectedProductId(value as Id<'products'>)}
            >
              <SelectTrigger id="adjust-product">
                <SelectValue placeholder="Sélectionner un produit" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name} (stock actuel: {p.stockQuantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stock actuel (info) */}
          {selectedProduct && (
            <div className="p-2 sm:p-3 bg-muted rounded-lg">
              <p className="text-xs sm:text-sm text-muted-foreground">Stock actuel de {selectedProduct.name}</p>
              <p className="text-xl sm:text-2xl font-bold">{currentStock} {selectedProduct.unit}s</p>
            </div>
          )}

          {/* Nouvelle quantité */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="adjust-quantity" className="text-sm">
              Nouvelle quantité (stock réel) {selectedProduct ? `(${selectedProduct.unit}s)` : ''}
            </Label>
            <Input
              id="adjust-quantity"
              type="number"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
              placeholder="Ex: 45"
              min={0}
              disabled={isSubmitting || !selectedProductId}
              className="text-base sm:text-lg"
            />
            {selectedProduct && newQuantity && !isNaN(parseInt(newQuantity)) && (
              <div className={`text-xs sm:text-sm p-2 rounded ${
                parseInt(newQuantity) > currentStock
                  ? 'bg-[#7ABE4E]/10 text-[#016124]'
                  : parseInt(newQuantity) < currentStock
                    ? 'bg-red-50 text-red-700'
                    : 'bg-gray-50 text-gray-700'
              }`}>
                {parseInt(newQuantity) === currentStock ? (
                  'Aucun changement'
                ) : (
                  <>
                    Différence: {parseInt(newQuantity) > currentStock ? '+' : ''}
                    {parseInt(newQuantity) - currentStock} {selectedProduct.unit}s
                  </>
                )}
              </div>
            )}
          </div>

          {/* Motif */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="adjust-reason" className="text-sm">Motif de l'ajustement</Label>
            <Input
              id="adjust-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Inventaire du 15/01"
              disabled={isSubmitting}
              className="text-sm"
            />
            {/* Motifs rapides */}
            <div className="flex flex-wrap gap-1 sm:gap-2">
              {quickReasons.map((r) => (
                <Button
                  key={r}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-[10px] sm:text-xs px-2 h-6 sm:h-7"
                  onClick={() => setReason(r)}
                  disabled={isSubmitting}
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>

          {/* Bouton de validation */}
          <Button
            type="submit"
            variant="outline"
            className="w-full border-orange-400 text-orange-700 hover:bg-orange-50 text-sm sm:text-base h-9 sm:h-10"
            disabled={
              isSubmitting ||
              !newQuantity ||
              !reason.trim() ||
              !selectedProductId ||
              (selectedProduct && parseInt(newQuantity) === currentStock)
            }
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Ajustement...</span>
              </span>
            ) : (
              'Ajuster le stock'
            )}
          </Button>

          {/* Avertissement */}
          <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
            Cette action est irréversible et sera enregistrée dans l'historique
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
