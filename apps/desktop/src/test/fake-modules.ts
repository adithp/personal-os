import type { RequestOptions } from '../api/api-client';
import { createHabitsFake } from './fake-habits';
import { createMoneyFake } from './fake-money';
import { createProjectsFake } from './fake-projects';

/** What a lane's mock API answers for a path that is not one of its routes. */
export const NOT_HANDLED = Symbol('not-handled');

/** The mock APIs of the Habits, Money and Projects lanes, asked in order by createFakeApi. */
export function createModuleFakes() {
  const fakes = [createHabitsFake(), createMoneyFake(), createProjectsFake()];
  return {
    handle: (method: string, path: string, options: RequestOptions): unknown => {
      for (const fake of fakes) {
        const answer = fake.handle(method, path, options);
        if (answer !== NOT_HANDLED) return answer;
      }
      return NOT_HANDLED;
    },
  };
}
