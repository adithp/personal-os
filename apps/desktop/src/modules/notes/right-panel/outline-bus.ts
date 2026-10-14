/**
 * How the Outline tab asks the editor to go to a heading. The editor pane registers one function
 * while it is mounted; the panel calls it with the heading's position among the note's H1 to H3
 * headings (0 is the first). With no editor registered, a jump does nothing.
 */
export type HeadingJump = (index: number) => void;

let current: HeadingJump | null = null;

/** Called by the editor pane. Returns the function that removes it (use it as the effect cleanup). */
export function registerHeadingJump(jump: HeadingJump): () => void {
  current = jump;
  return () => {
    if (current === jump) current = null;
  };
}

/** Called by the Outline tab. */
export function jumpToHeading(index: number): void {
  current?.(index);
}
