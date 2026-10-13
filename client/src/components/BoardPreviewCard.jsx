import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import AvatarStack from './AvatarStack';

/**
 * Compact dashboard tile that renders a mini preview of a board's
 * whiteboard strokes on a canvas.
 *
 * The preview deliberately keeps its own coordinate space: strokes come
 * from the full-size (1200x600) canvas, and we scale them down to fit
 * the card. This keeps the stored stroke data unchanged and lets the
 * card render at any size.
 */
const PREVIEW_W = 320;
const PREVIEW_H = 180;

export default function BoardPreviewCard({ board }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Light grid backdrop so empty boards don't look broken.
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < canvas.width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const strokes = board.strokes ?? [];
    if (strokes.length === 0) return;

    // Compute bounding box of all strokes to auto-fit the preview.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of strokes) {
      for (const [x, y] of s.points) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (!isFinite(minX)) return;

    const pad = 20;
    const boxW = Math.max(1, maxX - minX);
    const boxH = Math.max(1, maxY - minY);
    const scale = Math.min(
      (canvas.width - pad * 2) / boxW,
      (canvas.height - pad * 2) / boxH,
      1 // never zoom in past 1:1
    );

    const offsetX = (canvas.width - boxW * scale) / 2 - minX * scale;
    const offsetY = (canvas.height - boxH * scale) / 2 - minY * scale;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const s of strokes) {
      if (!s.points || s.points.length < 2) continue;
      ctx.strokeStyle = s.color || '#111827';
      ctx.lineWidth = (s.width || 2) / scale; // compensate for scale
      ctx.beginPath();
      ctx.moveTo(s.points[0][0], s.points[0][1]);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i][0], s.points[i][1]);
      }
      ctx.stroke();
    }
    ctx.restore();
  }, [board.strokes]);

  const updated = new Date(board.updatedAt);
  const relative = formatRelative(updated);

  return (
    <Link
      to={`/board/${board._id}`}
      className="group block bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-900 hover:shadow-md transition-all"
    >
      <div className="relative bg-slate-50">
        <canvas
          ref={canvasRef}
          width={PREVIEW_W}
          height={PREVIEW_H}
          className="w-full block"
        />
        {board.strokes?.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
            Empty board
          </div>
        )}
      </div>

      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm truncate group-hover:text-slate-900">
            {board.name}
          </h3>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
            {relative}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                {board.strokes?.length ?? 0} strokes
                </span>
                <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                {board.taskCount ?? 0} tasks
                </span>
            </div>

            <AvatarStack members={board.members ?? []} max={4} size={22} />
        </div>
      </div>
    </Link>
  );
}

/**
 * Lightweight relative-time formatter. Keeps a dependency out of the
 * bundle for a single string, and normalizes output across browsers.
 */
function formatRelative(date) {
  const diff = Date.now() - date.getTime();
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;

  if (diff < min) return 'just now';
  if (diff < hour) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return date.toLocaleDateString();
}