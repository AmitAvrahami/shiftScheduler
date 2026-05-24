import AppError from '../utils/AppError';
import type {
  ForbiddenAssignmentDTO,
  PenaltyTermDTO,
  RelaxationWeightsDTO,
} from '../types/constraint';

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

export type SolverShiftType = 'morning' | 'afternoon' | 'night';

export interface SolverShiftDefinition {
  id: string;
  name: string;
  shift_type: SolverShiftType;
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
  // PR #3 — dual-payload transport. Sent on the wire alongside the legacy
  // `availability` field; Python consumes forbidden_assignments additively.
  forbidden_assignments?: ForbiddenAssignmentDTO[];
  penalties?: PenaltyTermDTO[];
  relaxation_weights?: RelaxationWeightsDTO;
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
  // Structured fields (PR09). Optional so an older solver response shape (no
  // type/severity/shift_ids) still parses without breaking callers.
  type?: string;
  severity?: 'info' | 'warning';
  worker_id: string | null;
  shift_ids?: string[];
  message: string;
}

export interface SolveResult {
  status: SolveStatus;
  assignments: SolverAssignment[];
  violations: SolverViolation[];
  warnings: SolverWarning[];
  // PR10 — schedule quality score. `total_penalty` is the summed soft-quality
  // penalty at the solved values; `penalty_breakdown` maps each soft category to
  // its contribution. Hard-relaxation (coverage/load) penalties are excluded.
  // Optional so an older solver response shape still parses.
  total_penalty?: number;
  penalty_breakdown?: Record<string, number>;
  solve_time_ms: number;
}

export const SOLVER_ERROR_CODES = {
  CONFIG_MISSING: 'ERR_SOLVER_CONFIG_MISSING',
  TIMEOUT: 'ERR_SOLVER_TIMEOUT',
  UNAVAILABLE: 'ERR_SOLVER_UNAVAILABLE',
  INVALID_REQUEST: 'ERR_SOLVER_INVALID_REQUEST',
  INTERNAL: 'ERR_SOLVER_INTERNAL',
  UNEXPECTED_STATUS: 'ERR_SOLVER_UNEXPECTED_STATUS',
  MALFORMED_RESPONSE: 'ERR_SOLVER_MALFORMED_RESPONSE',
} as const;

export async function callSolver(payload: SolveRequest): Promise<SolveResult> {
  const solverUrl = process.env.SOLVER_URL;
  if (!solverUrl) {
    throw new AppError('SOLVER_URL is not configured', 500, SOLVER_ERROR_CODES.CONFIG_MISSING);
  }

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
        throw new AppError(
          `Solver timed out after ${timeoutMs}ms`,
          504,
          SOLVER_ERROR_CODES.TIMEOUT
        );
      }
      throw new AppError('Solver unavailable', 503, SOLVER_ERROR_CODES.UNAVAILABLE);
    }

    if (response.status === 422) {
      let detail = 'validation error';
      try {
        const body = (await response.json()) as { detail?: string };
        if (typeof body.detail === 'string' && body.detail.length > 0) {
          detail = body.detail;
        }
      } catch {
        // Body wasn't valid JSON; keep the generic validation message.
      }
      throw new AppError(
        `Invalid solver request: ${detail}`,
        400,
        SOLVER_ERROR_CODES.INVALID_REQUEST
      );
    }
    if (response.status >= 500) {
      throw new AppError('Solver internal error', 502, SOLVER_ERROR_CODES.INTERNAL);
    }
    if (!response.ok) {
      throw new AppError(
        `Unexpected solver response: ${response.status}`,
        502,
        SOLVER_ERROR_CODES.UNEXPECTED_STATUS
      );
    }

    try {
      return (await response.json()) as SolveResult;
    } catch {
      throw new AppError('Malformed solver response', 502, SOLVER_ERROR_CODES.MALFORMED_RESPONSE);
    }
  } finally {
    clearTimeout(timer);
  }
}
