import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [boards, setBoards] = useState([]);
  const [name, setName] = useState('');
  const navigate = useNavigate();

  const load = () => api.get('/boards').then(({ data }) => setBoards(data.boards));

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const { data } = await api.post('/boards', { name: name.trim() });
    setName('');
    navigate(`/board/${data.board.id}`);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">Your boards</h1>
          <p className="text-xs text-slate-500">Welcome back, {user?.name}</p>
        </div>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="text-sm px-3 py-1.5 border rounded hover:bg-slate-50"
        >
          Log out
        </button>
      </header>

      <form onSubmit={create} className="flex gap-2">
        <input
          placeholder="New board name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 border rounded-md p-2 text-sm"
        />
        <button className="bg-slate-900 text-white rounded-md px-4 text-sm hover:bg-slate-700">
          Create
        </button>
      </form>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {boards.map((b) => (
          <li key={b._id}>
            <Link
              to={`/board/${b._id}`}
              className="block bg-white p-4 rounded-lg border hover:border-slate-900 shadow-sm"
            >
              <div className="font-medium">{b.name}</div>
              <div className="text-xs text-slate-500">
                Updated {new Date(b.updatedAt).toLocaleString()}
              </div>
            </Link>
          </li>
        ))}
        {boards.length === 0 && (
          <li className="text-sm text-slate-500">No boards yet. Create your first one above.</li>
        )}
      </ul>
    </div>
  );
}