import type { ReactNode } from 'react'

export type BoardMenuSectionId = 'overlays' | 'learn' | 'bot'

const SECTIONS: { id: BoardMenuSectionId; label: string }[] = [
  { id: 'bot', label: 'Play bot' },
  { id: 'learn', label: 'Learn' },
  { id: 'overlays', label: 'Appearance' },
]

type BoardMenuProps = {
  open: Record<BoardMenuSectionId, boolean>
  onToggle: (id: BoardMenuSectionId) => void
  overlays: ReactNode
  learn: ReactNode
  playBot: ReactNode
}

export function BoardMenu({
  open,
  onToggle,
  overlays,
  learn,
  playBot,
}: BoardMenuProps) {
  const panels: Record<BoardMenuSectionId, ReactNode> = {
    overlays,
    learn,
    bot: playBot,
  }

  return (
    <nav className="board-menu" aria-label="Board options">
      <div className="board-menu-tabs" role="tablist">
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`board-menu-tab-${id}`}
            aria-selected={open[id]}
            aria-expanded={open[id]}
            aria-controls={`board-menu-panel-${id}`}
            className={`board-menu-tab${open[id] ? ' board-menu-tab--open' : ''}`}
            onClick={() => onToggle(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {SECTIONS.map(
        ({ id, label }) =>
          open[id] ? (
            <div
              key={id}
              id={`board-menu-panel-${id}`}
              className="board-menu-panel"
              role="tabpanel"
              aria-labelledby={`board-menu-tab-${id}`}
            >
              <h2 className="board-menu-panel-title">{label}</h2>
              {panels[id]}
            </div>
          ) : null,
      )}
    </nav>
  )
}

type BoardMenuSubsectionProps = {
  title: string
  children: ReactNode
}

export function BoardMenuSubsection({ title, children }: BoardMenuSubsectionProps) {
  return (
    <section className="board-menu-subsection">
      <h3 className="board-menu-subtitle">{title}</h3>
      {children}
    </section>
  )
}

type CollapsibleSubsectionProps = {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}

export function CollapsibleSubsection({
  title,
  open,
  onToggle,
  children,
}: CollapsibleSubsectionProps) {
  const panelId = `learn-sub-${title.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <section className="board-menu-collapsible">
      <button
        type="button"
        className="board-menu-collapsible-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="board-menu-collapsible-chevron" aria-hidden>
          {open ? '▼' : '▶'}
        </span>
        {title}
      </button>
      {open ? (
        <div id={panelId} className="board-menu-collapsible-body">
          {children}
        </div>
      ) : null}
    </section>
  )
}
