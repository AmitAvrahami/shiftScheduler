import AppError from '../utils/AppError';

export interface SolverAvailabilityEntry {
  date: string;
  definition_id: string;
  can_work: boolean;
}

export interface SolverWorker {
  id: string;
  role: 'employee' | 'manager';
  is_fixed_morning: boolean;
  availability: SolverAvailabilityEntry[];
}

export interface SolverShiftDefinition {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  crosses_midnight: boolean;
}

export interface SolverShift {
  id: string;
  date: string;
  definition_id: string;
  required_count: number;
}

export interface SolveRequest {
  schedule_id: string;
  week_id: string;
  workers: SolverWorker[];
  shift_definitions: SolverShiftDefinition[];
  shifts: SolverShift[];
}

export type SolveStatus = 'OPTIMAL' | 'FEASIBLE' | 'RELAXED' | 'INFEASIBLE';

export interface SolverAssignment {
  shift_id: string;
  worker_id: string;
  assigned_by: 'algorithm';
}

export interface SolverViolation {
  constraint_id: string;
  shift_id: string | null;
  worker_id: string | null;
  message: string;
}

export interface SolverWarning {
  constraint_id: string;
  worker_id: string | null;
  message: string;
}

export interface SolveResult {
  status: SolveStatus;
  assignments: SolverAssignment[];
  violations: SolverViolation[];
  warnings: SolverWarning[];
  solve_time_ms: number;
}

export async function callSolver(payload: SolveRequest): Promise<SolveResult> {
  const solverUrl = process.env.SOLVER_URL;
  if (!solverUrl) throw new AppError('SOLVER_URL is not configured', 500);

  const timeoutMs = parseInt(process.env.SOLVER_TIMEOUT_MS ?? '30000', 10) || 30000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(`${solverUrl}/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AppError(`Solver timed out after ${timeoutMs}ms`, 504);
      }
      throw new AppError('Solver unavailable', 503);
    }

    if (response.status === 422) {
      const body = (await response.json()) as { detail?: string };
      throw new AppError(`Invalid solver request: ${body.detail ?? 'validation error'}`, 400);
    }
    if (response.status >= 500) {
      throw new AppError('Solver internal error', 502);
    }
    if (!response.ok) {
      throw new AppError(`Unexpected solver response: ${response.status}`, 502);
    }

    return (await response.json()) as SolveResult;
  } finally {
    clearTimeout(timer);
  }
}
