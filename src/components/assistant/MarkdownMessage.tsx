import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Rendu Markdown léger et SÛR des réponses de l'assistant.
// Pas de HTML brut (react-markdown ne l'interprète pas par défaut → pas d'injection).
// Le projet n'a pas @tailwindcss/typography : on stylise chaque élément ici.
const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-locagri-primary underline">
      {children}
    </a>
  ),
  h1: ({ children }) => <h1 className="text-base font-semibold mb-2 mt-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-semibold mb-1.5 mt-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-1">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-gray-200 pl-3 italic text-gray-600 my-2">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    // react-markdown v10 ne fournit plus la prop `inline`. On détecte un bloc via
    // la classe `language-*` ou un saut de ligne : les blocs sont déjà encadrés par
    // `pre`, seul le code inline reçoit la pastille grise (sinon double fond/padding).
    const isBlock =
      (typeof className === 'string' && className.startsWith('language-')) ||
      String(children ?? '').includes('\n')
    if (isBlock) {
      return <code className="font-mono">{children}</code>
    }
    return (
      <code className="bg-gray-100 text-locagri-primary rounded px-1 py-0.5 text-[0.85em] font-mono">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="bg-gray-100 rounded-lg p-2.5 my-2 overflow-x-auto text-xs font-mono">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-gray-200 px-2 py-1 text-left font-semibold whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-gray-200 px-2 py-1 align-top">{children}</td>,
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="text-sm text-gray-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
