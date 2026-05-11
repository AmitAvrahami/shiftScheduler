import AppError from '../../utils/AppError';
import type { ISolver } from './ISolver';
import { CurrentHttpSolver } from './CurrentHttpSolver';

export type SchedulerEngine = 'legacy';

export function getSolver(): ISolver {
  const engine = process.env.SCHEDULER_ENGINE ?? 'legacy';

  switch (engine) {
    case 'legacy':
      return new CurrentHttpSolver();

    default:
      throw new AppError(`Unknown SCHEDULER_ENGINE: ${engine}`, 500);
  }
}
