import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Package } from 'lucide-react'

export function ProductSetup() {
  const [name, setName] = useState('Riz 4.5 Kg')
  const [price, setPrice] = useState('')
  const [stockQuantity, setStockQuantity] = useState('')
  const [alertThreshold, setAlertThreshold] = useState('10')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const initProduct = useMutation(api.products.initProduct)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    const priceNum = parseInt(price)
    const stockNum = parseInt(stockQuantity)
    const alertNum = parseInt(alertThreshold)

    if (!name.trim()) {
      toast.error('Le nom du produit est requis')
      return
    }

    if (isNaN(priceNum) || priceNum <= 0) {
      toast.error('Le prix doit être un nombre positif')
      return
    }

    if (isNaN(stockNum) || stockNum < 0) {
      toast.error('Le stock doit être un nombre positif ou zéro')
      return
    }

    if (isNaN(alertNum) || alertNum < 0) {
      toast.error('Le seuil d\'alerte doit être un nombre positif ou zéro')
      return
    }

    setIsSubmitting(true)
    try {
      await initProduct({
        name: name.trim(),
        price: priceNum,
        stockQuantity: stockNum,
        alertThreshold: alertNum,
      })

      toast.success('Produit configuré', {
        description: 'Vous pouvez maintenant commencer à vendre',
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Erreur', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-3 sm:p-4 max-w-md mx-auto">
      <Card>
        <CardHeader className="text-center p-4 sm:p-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <Package className="w-6 h-6 sm:w-8 sm:h-8 text-[#016124]" />
          </div>
          <CardTitle className="text-lg sm:text-xl">Configuration du produit</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Configurez le produit que vous allez vendre.
            <br />
            Cette étape n'est requise qu'une seule fois.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            {/* Nom du produit */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="name" className="text-sm">Nom du produit</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Riz 4.5 Kg"
                disabled={isSubmitting}
              />
            </div>

            {/* Prix de vente */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="price" className="text-sm">Prix de vente (FCFA)</Label>
              <Input
                id="price"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Ex: 5000"
                min={1}
                disabled={isSubmitting}
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Prix unitaire par sac
              </p>
            </div>

            {/* Stock initial */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="stock" className="text-sm">Stock initial (sacs)</Label>
              <Input
                id="stock"
                type="number"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                placeholder="Ex: 100"
                min={0}
                disabled={isSubmitting}
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Nombre de sacs actuellement en stock
              </p>
            </div>

            {/* Seuil d'alerte */}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="alert" className="text-sm">Seuil d'alerte stock</Label>
              <Input
                id="alert"
                type="number"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
                placeholder="Ex: 10"
                min={0}
                disabled={isSubmitting}
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Vous serez alerté quand le stock descend sous ce niveau
              </p>
            </div>

            {/* Bouton de validation */}
            <Button
              type="submit"
              className="w-full h-10 sm:h-12 text-sm sm:text-lg"
              disabled={isSubmitting || !price || !stockQuantity}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Configuration...</span>
                </span>
              ) : (
                'Configurer le produit'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
