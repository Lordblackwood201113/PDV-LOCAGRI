import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { UserManagement, ProductManagement, ExpenseManagement } from '@/components/admin'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ShieldOff } from 'lucide-react'

export function AdminPage() {
  const [activeTab, setActiveTab] = useState('products')
  const currentUser = useQuery(api.users.getCurrentUser)

  // Chargement
  if (currentUser === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    )
  }

  // Vérification des permissions (admin uniquement)
  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldOff className="w-8 h-8 text-slate-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Accès restreint</h2>
          <p className="text-muted-foreground">
            Cette section est réservée aux administrateurs.
            <br />
            Contactez votre responsable si vous avez besoin d'accès.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-3 sm:p-4">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">Administration</h2>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="products" className="text-xs sm:text-sm py-2">Produits</TabsTrigger>
            <TabsTrigger value="expenses" className="text-xs sm:text-sm py-2">Dépenses</TabsTrigger>
            <TabsTrigger value="users" className="text-xs sm:text-sm py-2">Utilisateurs</TabsTrigger>
          </TabsList>

          {/* Onglet Gestion des produits */}
          <TabsContent value="products" className="mt-3 sm:mt-4">
            <ProductManagement />
          </TabsContent>

          {/* Onglet Gestion des dépenses */}
          <TabsContent value="expenses" className="mt-3 sm:mt-4">
            <ExpenseManagement />
          </TabsContent>

          {/* Onglet Gestion des utilisateurs */}
          <TabsContent value="users" className="mt-3 sm:mt-4">
            <UserManagement />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
