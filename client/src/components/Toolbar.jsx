const COLORS = ['#111827', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

export default function Toolbar({ color, setColor, width, setWidth, onClear }) {
  return (
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
      <div className="flex gap-1">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-slate-900' : 'border-transparent'}`}
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

      <button
        onClick={onClear}
        className="ml-auto text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-700"
      >
        Clear all
      </button>
    </div>
  );
}