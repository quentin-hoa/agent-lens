import clsx from 'clsx'
import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export const Markdown = memo(function Markdown({ children, className }: { children: string | null | undefined; className?: string }) {
  return (
    <div className={clsx('prose-panel', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  )
})
