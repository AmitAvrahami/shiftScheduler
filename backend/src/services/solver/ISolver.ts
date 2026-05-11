import type { SolveRequest, SolveResult } from '../solverClient';

export interface ISolver {
  solve(request: SolveRequest): Promise<SolveResult>;
}
