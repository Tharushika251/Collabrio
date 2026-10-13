import { useState } from 'react';
import api from '../api/axios';

/**
 * Share dialog for a board.
 *
 * The invite URL is derived from the share token, which lives on the board
 * document. Rotating invalidates all previously shared links; existing
 * members keep access because membership is stored on the board itself.
 */
export default function ShareModal({ board, onClose }) {
  const [token, setToken] = useState(board.shareToken);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

  const inviteUrl = `${window.location.origin}/join/${token}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail on insecure contexts; fall back to selection.
      const el = document.createElement('input');
      el.value = inviteUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const rotate = async () => {
    if (rotating) return;
    setRotating(true);
    try {
      const { data } = await api.post(`/boards/${board.id}/rotate-token`);
      setToken(data.shareToken);
    } finally {
      setRotating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold">Share this board</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Anyone with the link can join and collaborate.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            readOnly
            value={inviteUrl}
            onFocus={(e) => e.target.select()}
            className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono"
          />
          <button
            onClick={copy}
            className="text-sm px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-700"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 border-t pt-3">
          <span>Leaked the link by mistake?</span>
          <button
            onClick={rotate}
            disabled={rotating}
            className="text-slate-900 underline hover:no-underline disabled:opacity-50"
          >
            {rotating ? 'Rotating…' : 'Rotate link'}
          </button>
        </div>
      </div>
    </div>
  );
}