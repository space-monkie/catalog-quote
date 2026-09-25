"use client";

import type { ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/en";

export type SortableRenderProps = {
  index: number;
  handle: ReactNode;
  moveButtons: ReactNode;
};

type Props<T extends { id: string }> = {
  items: T[];
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, props: SortableRenderProps) => ReactNode;
  className?: string;
  disabled?: boolean;
};

/** Vertical sortable list: drag handle (mouse/touch/keyboard) plus up/down buttons. */
export function SortableList<T extends { id: string }>({ items, onReorder, renderItem, className, disabled }: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = items.map((i) => i.id);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    onReorder(arrayMove(ids, from, to));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={cn("space-y-2", className)}>
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              id={item.id}
              disabled={disabled}
              moveButtons={
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="flex h-7 w-11 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                    onClick={() => move(index, index - 1)}
                    disabled={disabled || index === 0}
                    aria-label={t.common.moveUp}
                  >
                    <ChevronUp className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="flex h-7 w-11 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                    onClick={() => move(index, index + 1)}
                    disabled={disabled || index === items.length - 1}
                    aria-label={t.common.moveDown}
                  >
                    <ChevronDown className="h-5 w-5" />
                  </button>
                </div>
              }
            >
              {(handle, moveButtons) => renderItem(item, { index, handle, moveButtons })}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  disabled,
  moveButtons,
  children,
}: {
  id: string;
  disabled?: boolean;
  moveButtons: ReactNode;
  children: (handle: ReactNode, moveButtons: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-gray-400 hover:bg-gray-100 active:cursor-grabbing"
      aria-label={t.common.dragHandle}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-5 w-5" />
    </button>
  );
  return (
    <li ref={setNodeRef} style={style} className={cn(isDragging && "z-10 opacity-80 shadow-lg")}>
      {children(handle, moveButtons)}
    </li>
  );
}
