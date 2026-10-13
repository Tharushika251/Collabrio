/**
 * Renders active users with avatars and a live "X is editing" indicator.
 * The indicator is derived from the `editors` map produced by usePresence.
 */
export default function PresenceBar({ users = [], editors = {} }) {
  const editingList = Object.entries(editors);

  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {users.map((u) => (
          <div
            key={u.userId}
            title={`${u.name}${u.sockets > 1 ? ` (${u.sockets} tabs)` : ''}`}
            className="w-8 h-8 rounded-full text-white text-xs font-semibold flex items-center justify-center border-2 border-white shadow"
            style={{ backgroundColor: u.color }}
          >
            {u.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {users.length === 0 && (
          <span className="text-xs text-slate-500">No other collaborators</span>
        )}
      </div>

      {editingList.length > 0 && (
        <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
          {editingList.map(([uid, info]) => `${info.name} is editing`).join(', ')}
        </div>
      )}
    </div>
  );
}