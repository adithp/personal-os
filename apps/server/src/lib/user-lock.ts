/**
 * Runs `work` after the earlier work with the same key and user is finished (a queue per user inside
 * this server process). Read-then-write limits (500 tasks per goal, one goal per task) need it
 * because actions cannot take a database lock. It does not protect several server instances; a lock
 * helper in UserScope would (lesson 2026-10-13).
 */
const queues = new Map<string, Promise<void>>();

export async function withUserLock<T>(
  key: string,
  userId: string,
  work: () => Promise<T>,
): Promise<T> {
  const name = `${key}:${userId}`;
  const result = (queues.get(name) ?? Promise.resolve()).then(work);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  queues.set(name, tail);
  void tail.then(() => {
    if (queues.get(name) === tail) queues.delete(name);
  });
  return result;
}
