import { useEffect, useRef, useState } from 'react';
import Toolbar from './Toolbar';
import { isPointNearStroke } from '../utils/hitTest';

/**
 * Canvas-based whiteboard.
 *
 * Rendering strategy:
 *  - All committed strokes live in `strokes` and are redrawn on state change.
 *  - The in-progress stroke is drawn directly on the canvas for low-latency feedback.
 *
 * Tool model:
 *  - 'pen'    freehand drawing
 *  - 'eraser' delete-by-drag: any stroke within radius of the pointer is removed
 *
 * Both tools funnel through the same op pipeline so remote peers see the
 * same effects as the local user, and the same ops replay on reconnect.
 */
const REF_W = 1200;
const REF_H = 600;

export default function Whiteboard({
  strokes,
  onStrokeCommit,
  onStrokeDelete,
  onClearAll,
}) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const currentRef = useRef(null);
  // Track strokes already scheduled for deletion in this eraser gesture
  // to avoid firing duplicate delete ops as the pointer passes over them.
  const erasedThisGestureRef = useRef(new Set());
  const lastErasePosRef = useRef(null);

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#111827');
  const [width, setWidth] = useState(3);
  const [selectedId, setSelectedId] = useState(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) {
      if (s.deleted || !s.points?.length) continue;
      drawStroke(ctx, s);
    }
    if (currentRef.current) drawStroke(ctx, currentRef.current);

    // Selection marquee: dashed rectangle around the selected stroke.
    if (selectedId) {
      const s = strokes.find((x) => x.id === selectedId && !x.deleted);
      if (s) {
        const xs = s.points.map((p) => p[0]);
        const ys = s.points.map((p) => p[1]);
        const minX = Math.min(...xs) - 6;
        const minY = Math.min(...ys) - 6;
        const maxX = Math.max(...xs) + 6;
        const maxY = Math.max(...ys) + 6;
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        ctx.restore();
      }
    }
  }, [strokes, tool, selectedId]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return [
      Math.round(((e.clientX - rect.left) / rect.width) * REF_W),
      Math.round(((e.clientY - rect.top) / rect.height) * REF_H),
    ];
  };

  const drawStroke = (ctx, stroke) => {
    if (!stroke.points || stroke.points.length === 0) return;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
    }
    ctx.stroke();
  };

  /**
   * Erases along a segment from `from` to `to`. Sampling the segment
   * (not just the current point) ensures fast drags don't skip over
   * strokes between animation frames.
   */
  const eraseAlongSegment = (from, to) => {
    const [x0, y0] = from;
    const [x1, y1] = to;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / 6)); // ~6 units per sample

    const victims = new Set();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      for (const s of strokes) {
        if (s.deleted) continue;
        if (erasedThisGestureRef.current.has(s.id)) continue;
        if (isPointNearStroke(x, y, s, 10)) victims.add(s.id);
      }
    }

    for (const id of victims) {
      erasedThisGestureRef.current.add(id);
      onStrokeDelete(id);
    }
  };

  const handlePointerDown = (e) => {
    drawingRef.current = true;
    canvasRef.current.setPointerCapture(e.pointerId);

    if (tool === 'pen') {
      currentRef.current = {
        id: crypto.randomUUID(),
        color,
        width,
        points: [getPos(e)],
      };
    } else if (tool === 'eraser') {
      erasedThisGestureRef.current = new Set();
      const pos = getPos(e);
      lastErasePosRef.current = pos;
      eraseAlongSegment(pos, pos);
    } else if (tool === 'select') {
      const [x, y] = getPos(e);
      // Topmost first: iterate strokes in reverse render order.
      let hit = null;
      for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i];
        if (s.deleted) continue;
        if (isPointNearStroke(x, y, s, 6)) {
          hit = s.id;
          break;
        }
      }
      setSelectedId(hit);
    }
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;

    if (tool === 'pen') {
      const point = getPos(e);
      const stroke = currentRef.current;
      if (!stroke) return;
      stroke.points.push(point);

      const ctx = canvasRef.current.getContext('2d');
      const n = stroke.points.length;
      if (n >= 2) {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(stroke.points[n - 2][0], stroke.points[n - 2][1]);
        ctx.lineTo(stroke.points[n - 1][0], stroke.points[n - 1][1]);
        ctx.stroke();
      }
    } else if (tool === 'eraser') {
      const pos = getPos(e);
      const last = lastErasePosRef.current ?? pos;
      eraseAlongSegment(last, pos);
      lastErasePosRef.current = pos;
    }
  };

  // Global key handler for the currently-selected stroke.
  // Attached to window so the user doesn't have to click the canvas first.
  useEffect(() => {
    const onKey = (e) => {
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Ignore when an input/textarea is focused (e.g. task board editing).
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        onStrokeDelete(selectedId);
        setSelectedId(null);
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, onStrokeDelete]);

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;

    if (tool === 'pen') {
      const stroke = currentRef.current;
      currentRef.current = null;
      if (stroke && stroke.points.length > 1) onStrokeCommit(stroke);
    } else if (tool === 'eraser') {
      erasedThisGestureRef.current = new Set();
      lastErasePosRef.current = null;
    }
  };

  return (
    <div className="space-y-2">
      <Toolbar
        tool={tool}
        setTool={setTool}
        color={color}
        setColor={setColor}
        width={width}
        setWidth={setWidth}
        onClear={onClearAll}
      />
      <canvas
        ref={canvasRef}
        width={REF_W}
        height={REF_H}
        className={`w-full h-[60vh] bg-white border border-slate-200 rounded-lg touch-none ${
          tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
}