/**
 * Geometry utilities for picking and manipulating strokes.
 *
 * All coordinates are in the reference space (1200 x 600), matching the
 * whiteboard canvas and the cursor/presence layer. Keeping everything in
 * one coordinate space avoids the size-mismatch bugs that plague canvas
 * editors when they mix client, canvas, and normalized units.
 */

/** Euclidean distance from point P to segment AB. */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  // Degenerate segment: fall back to point distance.
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);

  // Project P onto AB, clamped to the segment.
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Returns true if (x, y) is within `radius` of any segment of a stroke.
 * The stroke's own width is added so thicker strokes are easier to hit.
 */
export function isPointNearStroke(x, y, stroke, radius = 8) {
  if (!stroke || stroke.deleted) return false;
  const pts = stroke.points;
  if (!pts || pts.length === 0) return false;

  const threshold = radius + (stroke.width || 0) / 2;

  if (pts.length === 1) {
    return Math.hypot(x - pts[0][0], y - pts[0][1]) <= threshold;
  }

  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    if (distToSegment(x, y, ax, ay, bx, by) <= threshold) return true;
  }
  return false;
}

/**
 * Returns the ids of every stroke whose path comes within `radius`
 * of the point. Used by both the eraser and the selection tool.
 */
export function strokesNearPoint(x, y, strokes, radius = 8) {
  const hits = [];
  for (const s of strokes) {
    if (isPointNearStroke(x, y, s, radius)) hits.push(s.id);
  }
  return hits;
}

/**
 * Returns the bounding box of a set of strokes, or null if empty.
 * Used to render the selection marquee.
 */
export function boundingBoxOfStrokes(strokes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;

  for (const s of strokes) {
    if (!s.points) continue;
    for (const [x, y] of s.points) {
      any = true;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return any ? { minX, minY, maxX, maxY } : null;
}