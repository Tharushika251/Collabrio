import { useState } from 'react';
import TaskCard from './TaskCard';

/**
 * Kanban board. Each column is a drop target; dropping a card emits a move op.
 */
export default function TaskBoard({
  columns,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onMoveTask,
  onEditingChange,
}) {
  const [dragOverColumn, setDragOverColumn] = useState(null);

  const handleDrop = (e, toColumnId) => {
    e.preventDefault();
    setDragOverColumn(null);
    try {
      const { fromColumnId, taskId } = JSON.parse(e.dataTransfer.getData('application/json'));
      if (!fromColumnId || !taskId || fromColumnId === toColumnId) return;
      onMoveTask(fromColumnId, toColumnId, taskId);
    } catch {
      // Ignore malformed drag payloads.
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {columns.map((col) => (
        <div
          key={col.id}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverColumn(col.id);
          }}
          onDragLeave={() => setDragOverColumn(null)}
          onDrop={(e) => handleDrop(e, col.id)}
          className={`bg-slate-50 rounded-lg border p-3 min-h-[240px] ${
            dragOverColumn === col.id ? 'border-slate-900 bg-slate-100' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">{col.title}</h3>
            <span className="text-xs text-slate-500">{col.tasks.length}</span>
          </div>

          <div className="space-y-2">
            {col.tasks.map((task) => (
              <TaskCard
                key={task.id}
                columnId={col.id}
                task={task}
                onUpdate={onUpdateTask}
                onDelete={onDeleteTask}
                onMove={onMoveTask}
                onEditingChange={onEditingChange}
              />
            ))}
          </div>

          <button
            onClick={() => onAddTask(col.id)}
            className="mt-3 w-full text-xs py-1.5 rounded border border-dashed border-slate-300 hover:border-slate-500 text-slate-500"
          >
            + Add task
          </button>
        </div>
      ))}
    </div>
  );
}