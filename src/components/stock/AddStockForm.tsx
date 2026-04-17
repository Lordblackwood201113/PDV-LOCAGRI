import { useState } from 'react'
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
import { PackagePlus } from 'lucide-react'

interface AddStockFormProps {
  onSuccess?: () => void
}

export function AddStockForm({ onSuccess }: AddStockFormProps) {
  const [selectedProductId, setSelectedProductId] = useState<Id<'products'> | ''>('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const products = useQuery(api.products.getProducts)
  const addStock = useMutation(api.stock.addStock)

  const selectedProduct = products?.find((p) => p._id === selectedProductId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedProductId) {
      toast.error('Veuillez sélectionner un produit')
      return
    }

    const qty = parseInt(quantity)

    if (isNaN(qty) || qty <= 0) {
      toast.error('La quantité doit être un nombre positif')
      return
    }

    if (!reason.trim()) {
      toast.error('Le motif est requis')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await addStock({
        productId: selectedProductId as Id<'products'>,
        quantity: qty,
        reason: reason.trim(),
      })

      toast.success('Stock ajouté', {
        description: `+${qty} ${result.unit}(s) pour ${result.productName}. Nouveau stock: ${result.newStock}`,
      })

      // Réinitialiser le formulaire
      setQuantity('')
      setReason('')
      onSuccess?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Motifs prédéfinis
  const quickReasons = [
    'Réception commande',
    'Livraison fournisseur',
    'Transfert entrepôt',
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

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <PackagePlus className="w-4 h-4 sm:w-5 sm:h-5 text-[#016124]" />
          Entrée de stock
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Enregistrer une réception de marchandise
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          {/* Sélection du produit */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="add-product" className="text-sm">Produit</Label>
            <Select
              value={selectedProductId}
              onValueChange={(value) => setSelectedProductId(value as Id<'products'>)}
            >
              <SelectTrigger id="add-product">
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

          {/* Quantité */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="add-quantity" className="text-sm">
              Quantité à ajouter {selectedProduct ? `(${selectedProduct.unit}s)` : ''}
            </Label>
            <Input
              id="add-quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Ex: 50"
              min={1}
              disabled={isSubmitting}
              className="text-base sm:text-lg"
            />
            {/* Raccourcis quantité */}
            <div className="flex gap-1.5 sm:gap-2">
              {[10, 25, 50, 100].map((q) => (
                <Button
                  key={q}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-8"
                  onClick={() => setQuantity(q.toString())}
                  disabled={isSubmitting}
                >
                  +{q}
                </Button>
              ))}
            </div>
          </div>

          {/* Motif */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="add-reason" className="text-sm">Motif</Label>
            <Input
              id="add-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Réception commande #123"
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
            className="w-full text-sm sm:text-base h-9 sm:h-10"
            disabled={isSubmitting || !quantity || !reason.trim() || !selectedProductId}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Enregistrement...</span>
              </span>
            ) : (
              <span className="truncate">Ajouter {quantity || '0'} {selectedProduct?.unit || 'unité'}(s) au stock</span>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
