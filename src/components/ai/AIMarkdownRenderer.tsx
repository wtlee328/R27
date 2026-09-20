import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface AIMarkdownRendererProps {
  content: string
}

export const AIMarkdownRenderer: React.FC<AIMarkdownRendererProps> = ({ content }) => {
  if (!content) return null

  return (
    <div className="prose-ai text-xs sm:text-sm text-stone-800 dark:text-stone-200 leading-relaxed space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base font-black text-stone-950 dark:text-white mt-3 mb-1.5 border-b border-stone-200 dark:border-stone-800 pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-2.5 mb-1 flex items-center gap-1.5">
              <span className="w-1.5 h-3.5 bg-orange-500 rounded-full inline-block" />
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-bold text-stone-800 dark:text-stone-200 mt-2 mb-1">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-bold text-stone-950 dark:text-white bg-orange-50 dark:bg-orange-950/40 px-1 py-0.2 rounded text-orange-900 dark:text-orange-200">
              {children}
            </strong>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-2 pl-1 text-stone-700 dark:text-stone-300">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-2 pl-1 text-stone-700 dark:text-stone-300">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-orange-500 bg-stone-50 dark:bg-stone-800/60 pl-3 py-1.5 my-2 rounded-r-xl text-stone-600 dark:text-stone-300 italic text-xs">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className
            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-orange-600 dark:text-orange-400 font-mono text-[11px]"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return (
              <pre className="p-3 my-2 rounded-xl bg-stone-900 dark:bg-stone-950 text-stone-100 font-mono text-xs overflow-x-auto border border-stone-800">
                <code>{children}</code>
              </pre>
            )
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded-xl border border-stone-200 dark:border-stone-800">
              <table className="w-full text-left text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border-b border-stone-200 dark:border-stone-700 font-bold">
              {children}
            </thead>
          ),
          th: ({ children }) => <th className="px-3 py-2 font-semibold">{children}</th>,
          td: ({ children }) => (
            <td className="px-3 py-2 border-t border-stone-100 dark:border-stone-800">{children}</td>
          ),
          hr: () => <hr className="my-3 border-stone-200 dark:border-stone-800" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
