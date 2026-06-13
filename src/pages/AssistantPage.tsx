import { useState, useRef, useEffect } from 'react'
import { useQuery, useAction } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Send, Plus, MessageSquare, ShieldOff, Loader2, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const SUGGESTIONS = [
  'Fais-moi le point de la journée',
  "Qui me doit le plus d'argent ?",
  'Quels produits sont en rupture ?',
  'Quel est mon chiffre d’affaires ce mois-ci ?',
]

export function AssistantPage() {
  const currentUser = useQuery(api.users.getCurrentUser)
  const conversations = useQuery(api.assistant.getConversations)
  const ask = useAction(api.assistant.ask)

  const [conversationId, setConversationId] = useState<Id<'assistantConversations'> | null>(null)
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)

  const messages = useQuery(
    api.assistant.getMessages,
    conversationId ? { conversationId } : 'skip'
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isSending])

  if (currentUser === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldOff className="w-8 h-8 text-slate-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Accès restreint</h2>
          <p className="text-muted-foreground">L'assistant IA est réservé aux administrateurs.</p>
        </div>
      </div>
    )
  }

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || isSending) return
    setInput('')
    setIsSending(true)
    try {
      const result = await ask({
        conversationId: conversationId ?? undefined,
        message: question,
      })
      setConversationId(result.conversationId)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erreur inconnue'
      toast.error('Assistant', { description: msg })
      setInput(question)
    } finally {
      setIsSending(false)
    }
  }

  const newConversation = () => {
    setConversationId(null)
    setInput('')
  }

  const showEmptyState = !conversationId || (messages && messages.length === 0)

  return (
    <div className="h-full flex">
      {/* Colonne conversations */}
      <aside className="hidden md:flex md:flex-col w-60 border-r border-gray-100 bg-white">
        <div className="p-3">
          <Button onClick={newConversation} className="w-full bg-[#016124] hover:bg-[#017a2e]">
            <Plus className="w-4 h-4 mr-2" />
            Nouvelle conversation
          </Button>
        </div>
        <div className="flex-1 overflow-auto px-2 pb-2 space-y-1">
          {conversations?.map((c) => (
            <button
              key={c._id}
              onClick={() => setConversationId(c._id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors flex items-center gap-2',
                conversationId === c._id ? 'bg-[#016124]/10 text-[#016124] font-medium' : 'hover:bg-gray-50 text-gray-700'
              )}
            >
              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
              <span className="truncate">{c.title || 'Conversation'}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Zone chat */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50/50">
        {/* En-tête */}
        <div className="px-4 py-3 border-b border-gray-100 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#016124]/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#016124]" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-gray-900">Assistant IA</h2>
              <p className="text-[10px] text-gray-400">Analyse de vos données LOCAGRI</p>
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Lock className="w-3 h-3" /> Lecture seule
          </Badge>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
          {showEmptyState ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#016124]/10 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-[#016124]" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Posez une question sur votre activité</p>
                <p className="text-sm text-gray-500">CA, stock, créances, caisses, dépenses, journal…</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={isSending}
                    className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-700 hover:border-[#7ABE4E] hover:text-[#016124] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages?.map((m) => (
              <div
                key={m._id}
                className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'bg-[#016124] text-white rounded-br-sm'
                      : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm'
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}

          {isSending && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyse des données…
              </div>
            </div>
          )}
        </div>

        {/* Saisie */}
        <div className="p-3 border-t border-gray-100 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-center gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez votre question…"
              disabled={isSending}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={isSending || !input.trim()}
              className="bg-[#016124] hover:bg-[#017a2e]"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">
            L'assistant répond uniquement à partir de vos données et ne modifie rien.
          </p>
        </div>
      </div>
    </div>
  )
}
