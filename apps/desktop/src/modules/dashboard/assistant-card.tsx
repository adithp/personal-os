import { GlassCard, IconButton, Input } from '@personal-os/ui';
import { IconSend, IconSparkles } from '@tabler/icons-react';
import { useState, type SyntheticEvent } from 'react';

export interface AssistantCardProps {
  summary: string;
}

/** Daily summary and a message box. The assistant itself arrives in Step 3. */
export function AssistantCard({ summary }: AssistantCardProps) {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (text.trim() !== '') setSubmitted(true);
  };

  return (
    <GlassCard padding="compact" className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <IconSparkles size={20} stroke={1.75} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <p className="line-clamp-2 text-body text-fg-secondary">{summary}</p>
      </div>
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <Input
          aria-label="Ask or tell me what to do"
          placeholder="Ask or tell me what to do"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSubmitted(false);
          }}
        />
        <IconButton
          type="submit"
          aria-label="Send"
          disabled={text.trim() === ''}
          icon={<IconSend size={16} aria-hidden />}
          className="shrink-0 border-transparent bg-accent text-on-tile enabled:hover:bg-accent enabled:hover:brightness-105"
        />
      </form>
      {submitted && (
        <p role="status" className="text-small text-fg-muted">
          The assistant arrives in step 3.
        </p>
      )}
    </GlassCard>
  );
}
