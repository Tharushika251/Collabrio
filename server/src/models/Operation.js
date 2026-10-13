import mongoose from 'mongoose';

/**
 * Append-only operation log per board.
 * Enables replay, debugging, and late-join state reconstruction
 * without shipping the entire board on every reconnect.
 */
const operationSchema = new mongoose.Schema(
  {
    boardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    opType: {
      type: String,
      enum: ['stroke.add', 'stroke.delete', 'stroke.clear', 'task.add', 'task.update', 'task.move', 'task.delete', 'column.update'],
      required: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    version: { type: Number, required: true },
  },
  { timestamps: true }
);

operationSchema.index({ boardId: 1, version: 1 });

export default mongoose.model('Operation', operationSchema);