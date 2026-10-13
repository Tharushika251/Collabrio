import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import BoardPreviewCard from '../components/BoardPreviewCard';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const { data } = await api.get('/boards');
      setBoards(data.boards);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const { data } = await api.post('/boards', { name: name.trim() });
      setName('');
      navigate(`/board/${data.board.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
              C
            </div>
            <span className="font-semibold">Collabrio</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:inline">
              Signed in as <span className="text-slate-900 font-medium">{user?.name}</span>
            </span>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Your boards</h1>
            <p className="text-sm text-slate-500 mt-1">
              {boards.length === 0
                ? 'Create your first board to get started.'
                : `${boards.length} board${boards.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        <form onSubmit={create} className="flex gap-2 max-w-xl">
          <input
            placeholder="New board name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
          <button
            disabled={creating || !name.trim()}
            className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating…' : 'Create board'}
          </button>
        </form>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden animate-pulse"
              >
                <div className="h-[180px] bg-slate-100" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-slate-100 rounded w-2/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : boards.length === 0 ? (
          <EmptyState onCreate={() => document.querySelector('input')?.focus()} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((b) => (
              <BoardPreviewCard key={b._id} board={b} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Renders when the user has no boards. Guides them toward the single
 * next action rather than leaving a blank page.
 */
function EmptyState({ onCreate }) {
  return (
    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center bg-white">
      <div className="w-14 h-14 mx-auto rounded-xl bg-slate-100 flex items-center justify-center">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-slate-400"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      </div>
      <h3 className="mt-4 font-semibold text-slate-900">No boards yet</h3>
      <p className="mt-1 text-sm text-slate-500 max-w-xs mx-auto">
        Boards are shared spaces for drawing and planning with your team.
      </p>
      <button
        onClick={onCreate}
        className="mt-4 text-sm px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-700"
      >
        Create your first board
      </button>
    </div>
  );
}