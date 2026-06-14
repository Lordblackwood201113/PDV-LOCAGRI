import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
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
import { Gift, Plus, Trash2 } from 'lucide-react'

interface DonationFormProps {
  onSuccess?: () => void
}

interface DraftLine {
  productId: Id<'products'> | ''
  quantity: string
}

const formatPrice = (amount: number) => new Intl.NumberFormat('fr-FR').format(amount)

export function DonationForm({ onSuccess }: DonationFormProps) {
  const products = useQuery(api.products.getProducts)
  const recordDonation = useMutation(api.donations.recordDonation)

  const [donorName, setDonorName] = useState('')
  const [motif, setMotif] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([{ productId: '', quantity: '' }])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const productById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof products>[number]>()
    for (const p of products ?? []) map.set(p._id, p)
    return map
  }, [products])

  // Quantité cumulée par produit (un même produit peut apparaître sur plusieurs lignes)
  const aggregatedQty = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of lines) {
      const qty = Number(l.quantity)
      if (l.productId && Number.isInteger(qty) && qty > 0) {
        map.set(l.productId, (map.get(l.productId) ?? 0) + qty)
      }
    }
    return map
  }, [lines])

  // Produits dont la quantité cumulée dépasse le stock disponible
  const overStockProducts = useMemo(() => {
    const out: string[] = []
    for (const [productId, qty] of aggregatedQty) {
      const product = productById.get(productId)
      if (product && qty > product.stockQuantity) out.push(product.name)
    }
    return out
  }, [aggregatedQty, productById])

  const totalValue = useMemo(() => {
    let total = 0
    for (const [productId, qty] of aggregatedQty) {
      const product = productById.get(productId)
      if (product) total += product.price * qty
    }
    return total
  }, [aggregatedQty, productById])

  const validLineCount = aggregatedQty.size
  const canSubmit =
    !isSubmitting &&
    donorName.trim().length > 0 &&
    validLineCount > 0 &&
    overStockProducts.length === 0

  const addLine = () => setLines((prev) => [...prev, { productId: '', quantity: '' }])

  const removeLine = (index: number) =>
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))

  const updateLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!donorName.trim()) {
      toast.error('Indiquez la personne qui effectue le don')
      return
    }

    const items = lines
      .filter((l) => l.productId && Number.isInteger(Number(l.quantity)) && Number(l.quantity) > 0)
      .map((l) => ({ productId: l.productId as Id<'products'>, quantity: Number(l.quantity) }))

    if (items.length === 0) {
      toast.error('Ajoutez au moins un produit avec une quantité valide')
      return
    }

    if (overStockProducts.length > 0) {
      toast.error('Stock insuffisant', { description: overStockProducts.join(', ') })
      return
    }

    setIsSubmitting(true)
    try {
      const result = await recordDonation({
        donorName: donorName.trim(),
        motif: motif.trim() ? motif.trim() : undefined,
        items,
      })

      toast.success('Don enregistré', {
        description: `${result.donationReference} — ${result.itemCount} article(s), ${result.totalQuantity} unité(s) (~${formatPrice(result.totalValue)} FCFA)`,
      })

      if (result.lowStockProducts.length > 0) {
        toast.warning('Stock bas après le don', {
          description: result.lowStockProducts.join(', '),
        })
      }

      // Réinitialiser le formulaire
      setDonorName('')
      setMotif('')
      setLines([{ productId: '', quantity: '' }])
      onSuccess?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (products === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-6">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-muted-foreground">Chargement...</span>
      </div>
    )
  }

  if (!products || products.length === 0) {
    return (
      <div className="py-6 text-center text-muted-foreground">Aucun produit configuré</div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
      {/* Lignes produit */}
      <div className="space-y-2">
        <Label className="text-sm">Produits donnés</Label>
        {lines.map((line, index) => {
          const product = line.productId ? productById.get(line.productId) : undefined
          const qty = Number(line.quantity)
          const overStock =
            product && Number.isInteger(qty) && qty > 0 && qty > product.stockQuantity
          return (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <Select
                  value={line.productId}
                  onValueChange={(value) => updateLine(index, { productId: value as Id<'products'> })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Produit" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name} (stock : {p.stockQuantity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {overStock && product && (
                  <p className="text-[10px] sm:text-xs text-red-600 mt-1">
                    Stock disponible : {product.stockQuantity} {product.unit}(s)
                  </p>
                )}
              </div>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={line.quantity}
                onChange={(e) => updateLine(index, { quantity: e.target.value })}
                placeholder="Qté"
                disabled={isSubmitting}
                className="w-20 h-9 text-sm"
                aria-label="Quantité"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-red-600"
                onClick={() => removeLine(index)}
                disabled={isSubmitting || lines.length === 1}
                aria-label="Retirer la ligne"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs sm:text-sm h-8"
          onClick={addLine}
          disabled={isSubmitting}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Ajouter un produit
        </Button>
      </div>

      {/* Donneur */}
      <div className="space-y-1.5">
        <Label htmlFor="donation-donor" className="text-sm">
          Personne qui effectue le don
        </Label>
        <Input
          id="donation-donor"
          type="text"
          value={donorName}
          onChange={(e) => setDonorName(e.target.value)}
          placeholder="Ex : M. Koffi (LOCAGRI)"
          disabled={isSubmitting}
          className="text-sm"
        />
      </div>

      {/* Motif (optionnel) */}
      <div className="space-y-1.5">
        <Label htmlFor="donation-motif" className="text-sm">
          Motif <span className="text-muted-foreground">(optionnel)</span>
        </Label>
        <Input
          id="donation-motif"
          type="text"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Ex : Démonstration coopérative"
          disabled={isSubmitting}
          className="text-sm"
        />
      </div>

      {/* Total estimé */}
      <div className="flex items-center justify-between p-2.5 sm:p-3 bg-muted rounded-lg">
        <span className="text-xs sm:text-sm text-muted-foreground">Valeur estimée du don</span>
        <span className="text-base sm:text-lg font-bold">{formatPrice(totalValue)} FCFA</span>
      </div>

      {/* Avertissement stock insuffisant (quantité cumulée par produit) */}
      {overStockProducts.length > 0 && (
        <p className="text-xs sm:text-sm text-red-600">
          Stock insuffisant pour : {overStockProducts.join(', ')} (quantité cumulée supérieure au stock disponible).
        </p>
      )}

      <Button
        type="submit"
        className="w-full bg-locagri-accent hover:bg-locagri-accent/90 text-white text-sm sm:text-base h-9 sm:h-10"
        disabled={!canSubmit}
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Enregistrement...</span>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Gift className="w-4 h-4" />
            Enregistrer le don
          </span>
        )}
      </Button>

      <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
        Un don sort du stock sans encaissement (aucun argent en caisse).
      </p>
    </form>
  )
}
