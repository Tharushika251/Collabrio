import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

/**
 * Landing page for share-link invites.
 *
 * Two flows depending on auth state:
 *   - Authenticated: show a "Join" button, POST to /boards/join/:token.
 *   - Anonymous: show board preview and CTA to log in, passing a
 *     `next` param so they land back here after auth.
 */
export default function JoinBoard() {
  const { token } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/boards/invite/${token}`)
      .then(({ data }) => setPreview(data.board))
      .catch((err) =>
        setError(err.response?.data?.message || 'Could not load invite')
      )
      .finally(() => setLoading(false));
  }, [token]);

  const join = async () => {
    if (joining) return;
    setJoining(true);
    try {
      const { data } = await api.post(`/boards/join/${token}`);
      navigate(`/board/${data.board.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not join board');
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-50 flex items-center justify-center text-red-500 text-xl">
            !
          </div>
          <h1 className="font-semibold">Invite unavailable</h1>
          <p className="text-sm text-slate-500">{error}</p>
          <Link
            to="/"
            className="inline-block text-sm px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-700"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-sm w-full space-y-5">
        <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold">
          C
        </div>

        <div className="space-y-1">
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            You've been invited to
          </p>
          <h1 className="text-xl font-bold">{preview.name}</h1>
          <p className="text-sm text-slate-500">
            Created by {preview.ownerName} · {preview.memberCount}{' '}
            {preview.memberCount === 1 ? 'member' : 'members'}
          </p>
        </div>

        {user ? (
          <button
            onClick={join}
            disabled={joining}
            className="w-full bg-slate-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            {joining ? 'Joining…' : 'Join board'}
          </button>
        ) : (
          <div className="space-y-2">
            <Link
              to={`/login?next=/join/${token}`}
              className="block w-full text-center bg-slate-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-slate-700"
            >
              Sign in to join
            </Link>
            <Link
              to={`/register?next=/join/${token}`}
              className="block w-full text-center border border-slate-200 rounded-lg py-2 text-sm hover:bg-slate-50"
            >
              Create an account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}