/**
 * Renders up to `max` user avatars as an overlapping stack, with a
 * "+N" chip when there are more. Colors are derived deterministically
 * from the user id so the same person always gets the same color
 * across the app (matches the presence bar coloring).
 */
const PALETTE = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

function colorFor(id) {
  let hash = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initials(name = '?') {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function AvatarStack({ members = [], max = 4, size = 22 }) {
  if (members.length === 0) return null;

  const shown = members.slice(0, max);
  const overflow = members.length - shown.length;

  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {shown.map((m) => (
          <div
            key={m.id ?? m._id}
            title={m.name}
            className="rounded-full text-white flex items-center justify-center font-semibold border-2 border-white shadow-sm"
            style={{
              backgroundColor: colorFor(m.id ?? m._id),
              width: size,
              height: size,
              fontSize: size * 0.42,
            }}
          >
            {initials(m.name)}
          </div>
        ))}
      </div>

      {overflow > 0 && (
        <div
          className="ml-1.5 text-[10px] text-slate-500 font-medium"
          title={members.slice(max).map((m) => m.name).join(', ')}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}