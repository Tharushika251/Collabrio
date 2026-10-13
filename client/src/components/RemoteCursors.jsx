/**
 * Overlay of remote cursors positioned using the shared reference
 * coordinate space (1200 x 600), matching the whiteboard canvas.
 *
 * Incoming cursor coords are in reference space; the container's DOM
 * size is irrelevant to rendering because we use CSS percentages. This
 * guarantees every collaborator sees every cursor at the same logical
 * position regardless of their own screen size.
 */
const REF_W = 1200;
const REF_H = 600;
const STALE_MS = 5000;

export default function RemoteCursors({ cursors, users = [] }) {
  const now = Date.now();

  // Build a lookup so we can render the collaborator's name/color
  // next to their cursor.
  const byId = new Map(users.map((u) => [u.userId, u]));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Object.entries(cursors).map(([userId, c]) => {
        if (now - c.ts > STALE_MS) return null;

        const user = byId.get(userId);
        const leftPct = (c.x / REF_W) * 100;
        const topPct = (c.y / REF_H) * 100;

        // Clamp off-board cursors so they don't visually escape the frame.
        if (leftPct < -2 || leftPct > 102 || topPct < -2 || topPct > 102) return null;

        return (
          <div
            key={userId}
            className="absolute"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              transform: 'translate(-2px, -2px)',
              transition: 'left 80ms linear, top 80ms linear',
            }}
          >
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
              <path
                d="M1 1l13 8-6 1.5L5 17 1 1z"
                fill={user?.color || '#3b82f6'}
                stroke="white"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            {user?.name && (
              <span
                className="absolute left-4 top-4 px-1.5 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap shadow"
                style={{ backgroundColor: user?.color || '#3b82f6' }}
              >
                {user.name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}