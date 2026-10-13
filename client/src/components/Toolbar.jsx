const COLORS = ['#111827', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

/**
 * Whiteboard toolbar.
 *
 * The tool selector determines the pointer's behavior on the canvas:
 * pen draws, eraser deletes strokes within the pointer's radius.
 * Future tools (select, shape, text) plug into the same `setTool`
 * callback without changing the surrounding component tree.
 */
export default function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  width,
  setWidth,
  onClear,
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
      <div className="flex gap-1 bg-slate-100 rounded-md p-0.5">
        <ToolButton
          active={tool === 'pen'}
          onClick={() => setTool('pen')}
          label="Pen"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            <path d="M2 2l7.586 7.586" />
            <circle cx="11" cy="11" r="2" />
          </svg>
        </ToolButton>
        <ToolButton
          active={tool === 'eraser'}
          onClick={() => setTool('eraser')}
          label="Eraser"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 20H7L3 16a2 2 0 010-3l10-10a2 2 0 013 0l4 4a2 2 0 010 3L9 21" />
          </svg>
        </ToolButton>
        <ToolButton
          active={tool === 'select'}
          onClick={() => setTool('select')}
          label="Select"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
          </svg>
        </ToolButton>
      </div>

      {tool === 'pen' && (
        <>
          <div className="flex gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border-2 ${
                  color === c ? 'border-slate-900' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Size</span>
            <input
              type="range"
              min={1}
              max={12}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
            <span className="text-xs w-4">{width}</span>
          </div>
        </>
      )}

      <button
        onClick={onClear}
        className="ml-auto text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-700"
      >
        Clear all
      </button>
    </div>
  );
}

function ToolButton({ active, onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`px-2 py-1.5 rounded transition-colors ${
        active
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-500 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}