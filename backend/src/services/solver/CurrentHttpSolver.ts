import { callSolver, type SolveRequest, type SolveResult } from '../solverClient';
import type { ISolver } from './ISolver';

export class CurrentHttpSolver implements ISolver {
  solve(request: SolveRequest): Promise<SolveResult> {
    return callSolver(request);
  }
}
