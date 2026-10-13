import { useState } from 'react';

/**
 * Task card with drag-and-drop via native HTML5 DnD.
 * `onEditingChange` notifies the parent so the presence layer can broadcast
 * "X is editing" while the card is in input focus.
 */
export default function TaskCard({ columnId, task, onUpdate, onDelete, onMove, onEditingChange }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.text);

  const handleDragStart = (e) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ fromColumnId: columnId, taskId: task.id })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  const commit = () => {
    setEditing(false);
    onEditingChange?.(null);
    if (text.trim() !== task.text) {
      onUpdate(columnId, task.id, text.trim(), task.updatedAt);
    }
  };

  return (
    <div
      draggable={!editing}
      onDragStart={handleDragStart}
      className="bg-white border border-slate-200 rounded-md p-2 shadow-sm cursor-grab active:cursor-grabbing"
    >
      {editing ? (
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="w-full outline-none text-sm"
        />
      ) : (
        <div
          className="text-sm cursor-text"
          onClick={() => {
            setEditing(true);
            onEditingChange?.({ kind: 'task', id: task.id });
          }}
        >
          {task.text || <span className="text-slate-400 italic">Empty</span>}
        </div>
      )}

      <div className="flex justify-end mt-1">
        <button
          onClick={() => onDelete(columnId, task.id)}
          className="text-[10px] text-slate-400 hover:text-red-500"
        >
          delete
        </button>
      </div>
    </div>
  );
}