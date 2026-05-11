import http from 'http';
import { AddressInfo } from 'net';
import type {
  SolveRequest,
  SolveResult,
  SolveStatus,
  SolverAssignment,
} from '../../services/solverClient';

/**
 * Lightweight in-process HTTP stub that mimics the Python FastAPI solver for
 * Node integration tests. It exercises the real CurrentHttpSolver + callSolver
 * fetch path without requiring a Python runtime.
 *
 * Default behavior: assigns the first worker to every shift and returns
 * status OPTIMAL. Tests can override via `programResponse` before each request.
 */
export interface SolverStubHandle {
  url: string;
  getLastRequest(): SolveRequest | null;
  getRequestCount(): number;
  programResponse(next: SolveResult | ((req: SolveRequest) => SolveResult)): void;
  reset(): void;
  close(): Promise<void>;
}

export async function startSolverStub(): Promise<SolverStubHandle> {
  let lastRequest: SolveRequest | null = null;
  let requestCount = 0;
  let programmed: SolveResult | ((req: SolveRequest) => SolveResult) | null = null;

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/solve') {
      res.statusCode = 404;
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      let parsed: SolveRequest;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as SolveRequest;
      } catch {
        res.statusCode = 422;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ detail: 'invalid JSON' }));
        return;
      }

      lastRequest = parsed;
      requestCount += 1;

      const body: SolveResult = programmed
        ? typeof programmed === 'function'
          ? programmed(parsed)
          : programmed
        : defaultResult(parsed);

      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    getLastRequest: () => lastRequest,
    getRequestCount: () => requestCount,
    programResponse: (next) => {
      programmed = next;
    },
    reset: () => {
      lastRequest = null;
      requestCount = 0;
      programmed = null;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}

function defaultResult(req: SolveRequest): SolveResult {
  const firstWorkerId = req.workers[0]?.id;
  const assignments: SolverAssignment[] = firstWorkerId
    ? req.shifts.map((shift) => ({
        shift_id: shift.id,
        worker_id: firstWorkerId,
        assigned_by: 'algorithm',
      }))
    : [];

  const status: SolveStatus = 'OPTIMAL';
  return {
    status,
    assignments,
    violations: [],
    warnings: [],
    solve_time_ms: 7,
  };
}
