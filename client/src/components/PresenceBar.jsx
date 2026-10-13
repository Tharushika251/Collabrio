import { useAuth } from '../context/AuthContext';

/**
 * Renders active users with avatars and a live "X is editing" indicator.
 * The current user is filtered out of the avatar stack — collaborators
 * only care about who else is present, not that they themselves are.
 */
export default function PresenceBar({ users = [], editors = {} }) {
  const { user } = useAuth();
  const others = users.filter((u) => u.userId !== user?.id);

  const editingList = Object.entries(editors);

  return (
    <div className="flex items-center gap-3">
      {others.length > 0 ? (
        <div className="flex -space-x-2">
          {others.map((u) => (
            <div
              key={u.userId}
              title={`${u.name}${u.sockets > 1 ? ` (${u.sockets} tabs)` : ''}`}
              className="w-8 h-8 rounded-full text-white text-xs font-semibold flex items-center justify-center border-2 border-white shadow"
              style={{ backgroundColor: u.color }}
            >
              {u.name.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>
      ) : (
        <span className="text-xs text-slate-500">Only you here right now</span>
      )}

      {editingList.length > 0 && (
        <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
          {editingList
            .map(([uid, info]) => `${info.name} is editing`)
            .join(', ')}
        </div>
      )}
    </div>
  );
}