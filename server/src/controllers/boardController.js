import { z } from 'zod';
import Board from '../models/Board.js';
import crypto from 'node:crypto';

const createSchema = z.object({ name: z.string().min(1).max(80) });

export async function createBoard(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid board name' });

  const board = await Board.create({
    name: parsed.data.name,
    owner: req.user._id,
    members: [req.user._id],
    // 128 bits of entropy is overkill for a dev board but free, and it
    // means a leaked link is not brute-forceable in any realistic timeframe.
    shareToken: crypto.randomBytes(16).toString('base64url'),
  });

  res.status(201).json({ board: sanitize(board) });
}

export async function listBoards(req, res) {
  const boards = await Board.find({ members: req.user._id })
    .select('name owner members updatedAt strokes columns clearedAt')
    .populate('members', 'name email')   // ⬅️ NEW: hydrate names
    .sort({ updatedAt: -1 })
    .lean();

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

    // Only ship the fields the dashboard needs — never the full user doc.
    const members = (b.members || []).map((m) => ({
      id: m._id,
      name: m.name,
    }));

    return {
      _id: b._id,
      name: b.name,
      owner: b.owner,
      members,
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

/**
 * Public, unauthenticated lookup by share token.
 * Returns only enough metadata to render a "you've been invited" screen —
 * never the board contents.
 */
export async function getBoardByToken(req, res) {
  const { token } = req.params;

  const board = await Board.findOne({ shareToken: token })
    .select('name owner members updatedAt')
    .populate('owner', 'name');

  if (!board) return res.status(404).json({ message: 'Invalid or expired invite' });

  res.json({
    board: {
      id: board._id,
      name: board.name,
      ownerName: board.owner?.name ?? 'Unknown',
      memberCount: board.members.length,
      updatedAt: board.updatedAt,
    },
  });
}

/**
 * Adds the authenticated user to a board via share token.
 * Idempotent: joining twice is a no-op, not an error.
 */
export async function joinBoardByToken(req, res) {
  const { token } = req.params;

  const board = await Board.findOne({ shareToken: token });
  if (!board) return res.status(404).json({ message: 'Invalid or expired invite' });

  const alreadyMember = board.members.some(
    (m) => m.toString() === req.user._id.toString()
  );

  if (!alreadyMember) {
    board.members.push(req.user._id);
    await board.save();
  }

  res.json({ board: { id: board._id, name: board.name } });
}

export async function rotateShareToken(req, res) {
  const board = await Board.findById(req.params.id);
  if (!board) return res.status(404).json({ message: 'Board not found' });

  if (board.owner.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Only the owner can rotate the link' });
  }

  board.shareToken = crypto.randomBytes(16).toString('base64url');
  await board.save();

  res.json({ shareToken: board.shareToken });
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
    shareToken: board.shareToken, 
  };
}