/**
 * Overlay of remote cursors. Positions are relative to a container
 * (the parent of this component), matching the source coordinates.
 * Cursors older than 5s are considered stale and hidden.
 */
export default function RemoteCursors({ cursors, containerSize }) {
  const now = Date.now();
  return (
    <div className="pointer-events-none absolute inset-0">
      {Object.entries(cursors).map(([userId, c]) => {
        if (now - c.ts > 5000) return null;
        const x = (c.x / containerSize.width) * 100;
        const y = (c.y / containerSize.height) * 100;
        return (
          <div
            key={userId}
            className="absolute w-3 h-3 rounded-full bg-blue-500 shadow"
            style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
          />
        );
      })}
    </div>
  );
}