import type { NoteTemplate } from '@personal-os/shared';
import { Button, cx, IconButton, Input, Switch, Tooltip } from '@personal-os/ui';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../api/api-client';
import { useRovingList } from '../right-panel/use-roving-list';
import { EmptyState } from '../list/empty-state';
import { isNameTaken, useNoteTemplates, useTemplateActions } from '../templates-queries';
import { TemplateBody } from './template-body';

const NAME_TAKEN = 'A template with this name exists.';

/** The name field of one template: saves on Enter or when it loses focus, Escape puts the old name back. */
function NameField({ template, focusNow }: { template: NoteTemplate; focusNow: boolean }) {
  const { update } = useTemplateActions();
  const [draft, setDraft] = useState(template.name);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusNow) {
      box.current?.focus();
      box.current?.select();
    }
  }, [focusNow]);

  const commit = async () => {
    const name = draft.trim();
    if (name === '' || name === template.name) {
      setDraft(template.name);
      setError(null);
      return;
    }
    try {
      await update.mutateAsync({ id: template.id, name });
      setError(null);
    } catch (caught) {
      setError(
        isNameTaken(caught) ? NAME_TAKEN : caught instanceof ApiError ? caught.message : null,
      );
    }
  };

  return (
    <div className="min-w-0 flex-1">
      <Input
        ref={box}
        aria-label="Template name"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'template-name-error' : undefined}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void commit();
          } else if (event.key === 'Escape' && (draft !== template.name || error)) {
            event.preventDefault();
            event.stopPropagation();
            setDraft(template.name);
            setError(null);
          }
        }}
      />
      {error ? (
        <p id="template-name-error" role="alert" className="mt-1 px-1 text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Templates: the list on the left, the chosen template's name, daily switch and text on the right. */
export function TemplatesView() {
  const templates = useNoteTemplates();
  const { create, update, remove } = useTemplateActions();
  const [chosen, setChosen] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const items = templates.data ?? [];
  const current = items.find((t) => t.id === chosen) ?? items[0] ?? null;
  const roving = useRovingList(items.length);
  const newButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement | null>(null);
  const canAdd = templates.isSuccess;

  const addTemplate = async () => {
    if (create.isPending || !canAdd) return;
    const names = new Set(items.map((t) => t.name.toLowerCase()));
    let name = 'Untitled template';
    for (let n = 2; names.has(name.toLowerCase()); n += 1) name = `Untitled template ${String(n)}`;
    try {
      const made = await create.mutateAsync({ name });
      setChosen(made.id);
      setFresh(made.id);
    } catch {
      // The hook showed the server's message
    }
  };

  const deleteCurrent = (template: NoteTemplate) => {
    const index = items.findIndex((t) => t.id === template.id);
    const next = items[index + 1] ?? items[index - 1];
    setChosen(next?.id ?? null);
    remove.mutate(template.id);
    // The deleted row is going; focus the row that takes its place, or New template
    setTimeout(() => {
      const row = next ? list.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`) : null;
      (row ?? newButton.current)?.focus();
    }, 0);
  };

  return (
    <div aria-label="Templates" role="region" className="flex h-full min-h-0 min-w-0 flex-1 gap-3">
      <section
        aria-label="Template list"
        className="flex h-full min-h-0 w-[272px] shrink-0 flex-col gap-3 rounded-card glass p-3"
      >
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0 pl-1">
            <h2 className="truncate text-section font-semibold text-fg">Templates</h2>
            <p role="status" className="min-h-[15px] text-small text-fg-muted">
              {templates.isPending
                ? ' '
                : `${String(items.length)} ${items.length === 1 ? 'template' : 'templates'}`}
            </p>
          </div>
          <Tooltip label="New template">
            <IconButton
              ref={newButton}
              aria-label="New template"
              disabled={!canAdd}
              icon={<IconPlus size={16} stroke={1.5} aria-hidden />}
              onClick={() => {
                void addTemplate();
              }}
            />
          </Tooltip>
        </header>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {templates.isPending ? (
            <p role="status" className="px-2 text-body text-fg-muted">
              Loading templates…
            </p>
          ) : null}
          {templates.isError ? (
            <div role="alert" className="flex flex-col items-start gap-2 px-2">
              <p className="text-body text-fg">
                {templates.error instanceof ApiError
                  ? templates.error.message
                  : 'Could not load your templates.'}
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  void templates.refetch();
                }}
              >
                Try again
              </Button>
            </div>
          ) : null}
          {templates.data && items.length === 0 ? (
            <EmptyState
              title="No templates yet"
              text="A template is the starting text of a new note."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    void addTemplate();
                  }}
                >
                  New template
                </Button>
              }
            />
          ) : null}
          {items.length > 0 ? (
            <ul
              aria-label="Templates"
              className="flex flex-col"
              {...roving.listProps}
              ref={(element) => {
                list.current = element;
                roving.listProps.ref(element);
              }}
            >
              {items.map((template, index) => (
                <li key={template.id}>
                  <button
                    type="button"
                    data-id={template.id}
                    {...roving.itemProps(index)}
                    aria-current={current?.id === template.id ? 'true' : undefined}
                    onClick={() => {
                      setChosen(template.id);
                    }}
                    className={cx(
                      'flex w-full items-center justify-between gap-2 rounded-chip px-3 py-2 text-left focus-ring hover:bg-tint',
                      current?.id === template.id && 'bg-tint',
                    )}
                  >
                    <span className="truncate text-body font-medium text-fg">{template.name}</span>
                    {template.isDailyDefault ? (
                      <span className="shrink-0 rounded-chip bg-tint px-1.5 text-small text-fg-muted">
                        Daily
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section
        aria-label="Template editor"
        className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 rounded-card glass p-4"
      >
        {current ? (
          <>
            <div className="flex items-start gap-3">
              <NameField key={current.id} template={current} focusNow={fresh === current.id} />
              <div className="flex h-[34px] shrink-0 items-center gap-2">
                <span id="template-daily-label" className="text-body text-fg">
                  Use for daily notes
                </span>
                <Switch
                  aria-labelledby="template-daily-label"
                  checked={current.isDailyDefault}
                  onCheckedChange={(checked) => {
                    update.mutate({ id: current.id, isDailyDefault: checked });
                  }}
                />
                <Tooltip label="Delete template">
                  <IconButton
                    aria-label="Delete template"
                    icon={<IconTrash size={16} stroke={1.5} aria-hidden />}
                    onClick={() => {
                      deleteCurrent(current);
                    }}
                  />
                </Tooltip>
              </div>
            </div>
            <TemplateBody key={current.id} id={current.id} contentMd={current.contentMd} />
          </>
        ) : null}
      </section>
    </div>
  );
}
