import { useEffect, useRef, useState } from 'react';
import Toolbar from './Toolbar';

/**
 * Canvas-based whiteboard.
 *
 * Rendering strategy:
 *  - All committed strokes live in `strokes` and are redrawn on state change.
 *  - The in-progress stroke is drawn directly on the canvas for low-latency feedback.
 *
 * The parent owns the stroke list so ops can be funneled through the socket layer.
 */
export default function Whiteboard({ strokes, onStrokeCommit, onStrokeDelete, onClearAll  }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const currentRef = useRef(null);
  const [color, setColor] = useState('#111827');
  const [width, setWidth] = useState(3);

  // Redraw all committed strokes whenever the list changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) {
      if (s.deleted || !s.points?.length) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(s.points[0][0], s.points[0][1]);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0], s.points[i][1]);
      ctx.stroke();
    }

    if (currentRef.current) drawStroke(ctx, currentRef.current);
  }, [strokes]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return [
      Math.round(((e.clientX - rect.left) / rect.width) * canvas.width),
      Math.round(((e.clientY - rect.top) / rect.height) * canvas.height),
    ];
  };

  const drawStroke = (ctx, stroke) => {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
    for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
    ctx.stroke();
  };

  const handlePointerDown = (e) => {
    drawingRef.current = true;
    canvasRef.current.setPointerCapture(e.pointerId);
    currentRef.current = {
      id: crypto.randomUUID(),
      color,
      width,
      points: [getPos(e)],
    };
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
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
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const stroke = currentRef.current;
    currentRef.current = null;
    if (stroke && stroke.points.length > 1) onStrokeCommit(stroke);
  };

  return (
    <div className="space-y-2">
      <Toolbar
        color={color}
        setColor={setColor}
        width={width}
        setWidth={setWidth}
        onClear={onClearAll}
      />
      <canvas
        ref={canvasRef}
        width={1200}
        height={600}
        className="w-full h-[60vh] bg-white border border-slate-200 rounded-lg touch-none cursor-crosshair"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
}