import type { RequestOptions } from '../api/api-client';
import { NOT_HANDLED } from './fake-modules';

/** Projects lane: the mock API of this lane's routes (scaffold stub). Return NOT_HANDLED for any other path. */
export function createProjectsFake() {
  const handle = (_method: string, _path: string, _options: RequestOptions): unknown => NOT_HANDLED;
  return { handle };
}
