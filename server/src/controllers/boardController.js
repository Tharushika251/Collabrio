import { z } from 'zod';
import Board from '../models/Board.js';

const createSchema = z.object({ name: z.string().min(1).max(80) });

export async function createBoard(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid board name' });

  const board = await Board.create({
    name: parsed.data.name,
    owner: req.user._id,
    members: [req.user._id],
  });

  res.status(201).json({ board: sanitize(board) });
}

export async function listBoards(req, res) {
  const boards = await Board.find({ members: req.user._id })
    .select('name owner members updatedAt strokes columns clearedAt')
    .sort({ updatedAt: -1 })
    .lean();

  // Trim the payload for the dashboard: previews only need a subset of
  // strokes, and the task count is more useful than the full column tree.
  const summary = boards.map((b) => {
    const visibleStrokes = (b.strokes || [])
      .filter((s) => !s.deleted)
      .slice(-80)
      .map((s) => ({
        points: s.points,
        color: s.color,
        width: s.width,
      }));

    const taskCount = (b.columns || []).reduce(
      (sum, c) => sum + (c.tasks?.length || 0),
      0
    );

    return {
      _id: b._id,
      name: b.name,
      owner: b.owner,
      members: b.members,
      updatedAt: b.updatedAt,
      strokes: visibleStrokes,
      taskCount,
    };
  });

  res.json({ boards: summary });
}

export async function getBoard(req, res) {
  const board = await Board.findById(req.params.id);
  if (!board) return res.status(404).json({ message: 'Board not found' });

  const isMember = board.members.some((m) => m.toString() === req.user._id.toString());
  if (!isMember) return res.status(403).json({ message: 'Access denied' });

  res.json({ board: sanitize(board) });
}

function sanitize(board) {
  return {
    id: board._id,
    name: board.name,
    owner: board.owner,
    members: board.members,
    version: board.version,
    strokes: board.strokes,
    columns: board.columns,
    updatedAt: board.updatedAt,
  };
}