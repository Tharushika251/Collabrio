import mongoose from 'mongoose';

/**
 * A board is a collaborative room containing two layers:
 *  - strokes: whiteboard drawing elements (append-only, op-based)
 *  - columns: kanban columns with tasks
 *
 * `version` tracks the latest applied operation for conflict resolution:
 * clients send the version they last saw and the server rejects stale writes.
 */
const strokeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true },
    color: { type: String, default: '#111827' },
    width: { type: Number, default: 2 },
    points: { type: [[Number]], default: [] },
    deleted: { type: Boolean, default: false },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, default: '' },
    assignee: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: String, default: null },
  },
  { _id: false }
);

const columnSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, default: 'Column' },
    tasks: { type: [taskSchema], default: [] },
  },
  { _id: false }
);

const boardSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    strokes: { type: [strokeSchema], default: [] },
    columns: {
      type: [columnSchema],
      default: [
        { id: 'todo', title: 'To Do', tasks: [] },
        { id: 'in-progress', title: 'In Progress', tasks: [] },
        { id: 'done', title: 'Done', tasks: [] },
      ],
    },
    version: { type: Number, default: 0 },
    clearedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

boardSchema.index({ members: 1 });

export default mongoose.model('Board', boardSchema);