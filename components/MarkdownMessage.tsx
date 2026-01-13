import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';

interface MarkdownMessageProps {
  content: string;
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content }) => {
  return (
    <div className="markdown-content prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Customize heading styles
          h1: ({ node, ...props }) => (
            <h1 className="text-lg font-bold mt-4 mb-2 text-slate-900" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-base font-semibold mt-3 mb-2 text-slate-900" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-sm font-semibold mt-2 mb-1 text-slate-900" {...props} />
          ),
          // Customize paragraph styles
          p: ({ node, ...props }) => (
            <p className="mb-2 text-slate-800 leading-relaxed" {...props} />
          ),
          // Customize list styles
          ul: ({ node, ...props }) => (
            <ul className="list-disc list-inside mb-2 space-y-1 text-slate-800" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal list-inside mb-2 space-y-1 text-slate-800" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="text-slate-800" {...props} />
          ),
          // Customize code block styles
          code: ({ node, className, children, ...props }: any) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-xs font-mono break-words" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={`${className} block`} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ node, ...props }) => (
            <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto mb-2 text-xs [&>code]:block [&>code]:p-0 [&>code]:bg-transparent" {...props} />
          ),
          // Customize blockquote styles
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-slate-300 pl-3 italic text-slate-600 my-2" {...props} />
          ),
          // Customize link styles
          a: ({ node, ...props }) => (
            <a className="text-blue-600 hover:text-blue-700 underline" {...props} />
          ),
          // Customize strong/bold styles
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-slate-900" {...props} />
          ),
          // Customize emphasis/italic styles
          em: ({ node, ...props }) => (
            <em className="italic text-slate-700" {...props} />
          ),
          // Customize table styles
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border-collapse border border-slate-300" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-slate-100" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="border border-slate-300 px-3 py-2 text-left text-sm font-semibold text-slate-900" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="border border-slate-300 px-3 py-2 text-sm text-slate-800" {...props} />
          ),
          // Customize horizontal rule
          hr: ({ node, ...props }) => (
            <hr className="border-slate-200 my-3" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

