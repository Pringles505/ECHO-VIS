import React, { useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import docContent from '../../doc.md?raw';

// Derive a URL-safe anchor ID from a heading string — matches the convention
// used by docAnchor props in PropertiesPanel.jsx.
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Extract top-level (##) headings for the sidebar TOC.
function extractHeadings(markdown) {
  return markdown
    .split('\n')
    .filter(line => /^## /.test(line))
    .map(line => {
      const title = line.replace(/^## /, '').trim();
      return { title, id: slugify(title) };
    });
}

export default function DocsPage({ anchor, onBack }) {
  const headings = useMemo(() => extractHeadings(docContent), []);

  useEffect(() => {
    if (!anchor) return;
    // Small delay lets the DOM paint before we scroll
    const id = `docs-${anchor}`;
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => clearTimeout(t);
  }, [anchor]);

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: 'var(--app-bg)', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        height: 52, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 24px', gap: 16,
        background: 'var(--panel-bg-2)', borderBottom: '1px solid var(--border-strong)',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: '1px solid var(--border-strong)',
            borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer',
            fontSize: 12, padding: '4px 12px',
          }}
        >
          ← Back
        </button>
        <span style={{
          fontFamily: 'Lalezar, sans-serif', fontSize: 20,
          color: 'var(--text-main)', letterSpacing: '0.04em',
        }}>
          IRIS — Documentation
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>
          Edit <code style={{ background: 'var(--panel-bg-3)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>doc.md</code> to update
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar TOC */}
        <div style={{
          width: 200, flexShrink: 0, overflowY: 'auto',
          borderRight: '1px solid var(--border-strong)',
          padding: '16px 0',
          background: 'var(--panel-bg-2)',
        }}>
          {headings.map(h => (
            <button
              key={h.id}
              onClick={() => document.getElementById(`docs-${h.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '6px 20px', fontSize: 12,
                color: 'var(--text-muted)',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.background = 'var(--purple-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
            >
              {h.title}
            </button>
          ))}
        </div>

        {/* Markdown content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '36px 48px' }}>
          <div style={{ maxWidth: 740 }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 style={{
                    fontSize: 22, fontWeight: 700, color: 'var(--text-main)',
                    marginBottom: 28, marginTop: 0, letterSpacing: '-0.01em',
                  }}>
                    {children}
                  </h1>
                ),
                h2: ({ children }) => {
                  const id = slugify(String(children));
                  return (
                    <h2
                      id={`docs-${id}`}
                      style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                        textTransform: 'uppercase', color: 'var(--purple-bright)',
                        marginTop: 44, marginBottom: 12, paddingBottom: 8,
                        borderBottom: '1px solid var(--border-strong)',
                        scrollMarginTop: 20,
                      }}
                    >
                      {children}
                    </h2>
                  );
                },
                h3: ({ children }) => (
                  <h3 style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-main)',
                    marginTop: 20, marginBottom: 8,
                  }}>
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p style={{
                    fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65,
                    margin: '0 0 12px',
                  }}>
                    {children}
                  </p>
                ),
                strong: ({ children }) => (
                  <strong style={{ color: 'var(--text-main)', fontWeight: 600 }}>{children}</strong>
                ),
                em: ({ children }) => (
                  <em style={{ color: 'var(--text-muted)' }}>{children}</em>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    onClick={e => {
                      if (href?.startsWith('#')) {
                        e.preventDefault();
                        const id = `docs-${href.slice(1)}`;
                        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    style={{ color: 'var(--purple-bright)', textDecoration: 'none' }}
                  >
                    {children}
                  </a>
                ),
                code: ({ children }) => (
                  <code style={{
                    background: 'var(--panel-bg-3)', padding: '1px 5px',
                    borderRadius: 3, fontSize: 11, color: 'var(--text-main)',
                    fontFamily: 'monospace',
                  }}>
                    {children}
                  </code>
                ),
                table: ({ children }) => (
                  <table style={{
                    width: '100%', borderCollapse: 'collapse',
                    fontSize: 12, marginBottom: 16,
                  }}>
                    {children}
                  </table>
                ),
                thead: ({ children }) => <thead>{children}</thead>,
                tbody: ({ children }) => <tbody>{children}</tbody>,
                tr: ({ children }) => (
                  <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>{children}</tr>
                ),
                th: ({ children }) => (
                  <th style={{
                    padding: '6px 12px 6px 0', textAlign: 'left',
                    color: 'var(--text-dim)', fontWeight: 600,
                    fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
                    paddingBottom: 8, borderBottom: '1px solid var(--border-strong)',
                  }}>
                    {children}
                  </th>
                ),
                td: ({ children, isHeader }) => (
                  <td style={{
                    padding: '7px 12px 7px 0', verticalAlign: 'top',
                    color: 'var(--text-muted)', lineHeight: 1.5,
                  }}
                    className={isHeader ? 'prop-name' : ''}
                  >
                    {children}
                  </td>
                ),
                li: ({ children }) => (
                  <li style={{
                    fontSize: 13, color: 'var(--text-muted)',
                    lineHeight: 1.65, marginBottom: 4,
                  }}>
                    {children}
                  </li>
                ),
                ul: ({ children }) => (
                  <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>{children}</ul>
                ),
                hr: () => (
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border-strong)', margin: '32px 0' }} />
                ),
              }}
            >
              {docContent}
            </ReactMarkdown>
            <div style={{ height: 80 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
