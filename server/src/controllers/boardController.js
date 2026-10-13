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
    .select('name owner members updatedAt')
    .sort({ updatedAt: -1 });
  res.json({ boards });
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