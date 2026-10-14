import type { Category, CategoryKind } from '@personal-os/shared';
import { Button, Input, SegmentedControl } from '@personal-os/ui';
import { useState } from 'react';
import { useCategoryActions } from '../money-actions';
import { useCategories } from '../money-queries';
import { SWATCHES } from '../ui/field-styles';
import { ColorDot, ColorPicker } from '../ui/fields';
import { FormDialog } from '../ui/form-dialog';

const KINDS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
] as const;

/** Add, rename, recolor and delete categories. Deleted ones leave their transactions uncategorised. */
export function CategoriesDialog({ onClose }: { onClose: () => void }) {
  const categories = useCategories();
  const { create, update, remove } = useCategoryActions();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [color, setColor] = useState(SWATCHES[0] ?? '');
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startEdit = (category: Category) => {
    setEditing(category);
    setEditName(category.name);
    setEditColor(category.color);
    setError(null);
  };

  const save = () => {
    if (!editing) return;
    if (!editName.trim()) {
      setError('Name is required');
      return;
    }
    setError(null);
    update.mutate(
      { id: editing.id, name: editName.trim(), color: editColor },
      {
        onSuccess: () => {
          setEditing(null);
        },
      },
    );
  };

  const add = () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setError(null);
    create.mutate(
      { name: name.trim(), kind, color },
      {
        onSuccess: () => {
          setName('');
        },
      },
    );
  };

  return (
    <FormDialog title="Categories" onSubmit={editing ? save : add} onClose={onClose} error={error}>
      <div className="flex flex-col gap-1">
        <span className="text-small font-medium text-fg-muted">New category</span>
        <div className="flex gap-2">
          <Input
            aria-label="New category"
            value={name}
            maxLength={60}
            placeholder="Groceries…"
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <Button type="submit" disabled={create.isPending}>
            Add
          </Button>
        </div>
      </div>
      <SegmentedControl label="New category kind" value={kind} options={KINDS} onChange={setKind} />
      <ColorPicker value={color} onChange={setColor} label="New category color" />

      {categories.isError ? (
        <p role="alert" className="text-small text-danger">
          Could not load the categories.
        </p>
      ) : (
        <ul aria-label="All categories" className="flex flex-col gap-1">
          {(categories.data ?? []).map((category) =>
            editing?.id === category.id ? (
              <li key={category.id} className="flex flex-col gap-2 rounded-chip bg-input p-2">
                <Input
                  aria-label="Category name"
                  value={editName}
                  maxLength={60}
                  onChange={(event) => {
                    setEditName(event.target.value);
                  }}
                />
                <ColorPicker value={editColor} onChange={setEditColor} label="Category color" />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditing(null);
                    }}
                  >
                    Cancel edit
                  </Button>
                  <Button disabled={update.isPending} onClick={save}>
                    Save category
                  </Button>
                </div>
              </li>
            ) : (
              <li key={category.id} className="flex items-center gap-2 px-1 py-0.5">
                <ColorDot color={category.color} />
                <span className="flex-1 truncate text-body text-fg">{category.name}</span>
                <span className="text-small text-fg-muted">
                  {category.kind === 'income' ? 'Income' : 'Expense'}
                </span>
                <Button
                  variant="secondary"
                  aria-label={`Edit category ${category.name}`}
                  onClick={() => {
                    startEdit(category);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  aria-label={`Delete category ${category.name}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    remove.mutate(category.id);
                  }}
                >
                  Delete
                </Button>
              </li>
            ),
          )}
        </ul>
      )}
    </FormDialog>
  );
}
