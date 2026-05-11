import AppError from '../utils/AppError';
import {
  callSolver,
  SOLVER_ERROR_CODES,
  SolveRequest,
  SolveResult,
} from '../services/solverClient';

type FetchMock = jest.SpyInstance<ReturnType<typeof fetch>, Parameters<typeof fetch>>;

let originalSolverUrl: string | undefined;
let originalSolverTimeoutMs: string | undefined;
let fetchSpy: FetchMock;

const SOLVER_URL = 'http://solver.test';

function makeRequest(): SolveRequest {
  return {
    schedule_id: 'sched-1',
    week_id: '2026-W20',
    workers: [],
    shift_definitions: [],
    shifts: [],
  };
}

function makeResponse(
  body: unknown,
  init: { status?: number; throwOnJson?: boolean } = {}
): Response {
  const { status = 200, throwOnJson = false } = init;
  const response = {
    ok: status >= 200 && status < 300,
    status,
    json: throwOnJson
      ? jest.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
      : jest.fn().mockResolvedValue(body),
  } as unknown as Response;
  return response;
}

beforeEach(() => {
  originalSolverUrl = process.env.SOLVER_URL;
  originalSolverTimeoutMs = process.env.SOLVER_TIMEOUT_MS;
  process.env.SOLVER_URL = SOLVER_URL;
  // Force a short timeout so timeout-related branches stay quick — not used by most tests.
  process.env.SOLVER_TIMEOUT_MS = '5000';
  fetchSpy = jest.spyOn(global, 'fetch') as FetchMock;
});

afterEach(() => {
  fetchSpy.mockRestore();
  if (originalSolverUrl === undefined) {
    delete process.env.SOLVER_URL;
  } else {
    process.env.SOLVER_URL = originalSolverUrl;
  }
  if (originalSolverTimeoutMs === undefined) {
    delete process.env.SOLVER_TIMEOUT_MS;
  } else {
    process.env.SOLVER_TIMEOUT_MS = originalSolverTimeoutMs;
  }
});

describe('callSolver — config errors', () => {
  it('throws AppError 500 with ERR_SOLVER_CONFIG_MISSING when SOLVER_URL is missing', async () => {
    delete process.env.SOLVER_URL;

    await expect(callSolver(makeRequest())).rejects.toMatchObject({
      statusCode: 500,
      code: SOLVER_ERROR_CODES.CONFIG_MISSING,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('callSolver — transport errors', () => {
  it('maps AbortError to AppError 504 ERR_SOLVER_TIMEOUT', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchSpy.mockRejectedValueOnce(abortErr);

    await expect(callSolver(makeRequest())).rejects.toMatchObject({
      statusCode: 504,
      code: SOLVER_ERROR_CODES.TIMEOUT,
    });
  });

  it('maps generic fetch rejection to AppError 503 ERR_SOLVER_UNAVAILABLE', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(callSolver(makeRequest())).rejects.toMatchObject({
      statusCode: 503,
      code: SOLVER_ERROR_CODES.UNAVAILABLE,
    });
  });
});

describe('callSolver — HTTP error mapping', () => {
  it('maps Python 422 to AppError 400 ERR_SOLVER_INVALID_REQUEST with detail in message', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeResponse({ detail: 'workers[0].id must not be empty' }, { status: 422 })
    );

    const error = await callSolver(makeRequest()).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 400,
      code: SOLVER_ERROR_CODES.INVALID_REQUEST,
    });
    expect((error as AppError).message).toContain('workers[0].id must not be empty');
  });

  it('still throws a 400 with generic message when 422 body is not JSON', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(null, { status: 422, throwOnJson: true }));

    const error = await callSolver(makeRequest()).catch((e) => e);

    expect(error).toMatchObject({
      statusCode: 400,
      code: SOLVER_ERROR_CODES.INVALID_REQUEST,
    });
    expect((error as AppError).message).toContain('validation error');
  });

  it('maps HTTP 500 to AppError 502 ERR_SOLVER_INTERNAL', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse('boom', { status: 500 }));

    await expect(callSolver(makeRequest())).rejects.toMatchObject({
      statusCode: 502,
      code: SOLVER_ERROR_CODES.INTERNAL,
    });
  });

  it('maps HTTP 503 to AppError 502 ERR_SOLVER_INTERNAL', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse('busy', { status: 503 }));

    await expect(callSolver(makeRequest())).rejects.toMatchObject({
      statusCode: 502,
      code: SOLVER_ERROR_CODES.INTERNAL,
    });
  });

  it('maps unexpected non-ok status (e.g. 418) to AppError 502 ERR_SOLVER_UNEXPECTED_STATUS', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse('teapot', { status: 418 }));

    const error = await callSolver(makeRequest()).catch((e) => e);

    expect(error).toMatchObject({
      statusCode: 502,
      code: SOLVER_ERROR_CODES.UNEXPECTED_STATUS,
    });
    expect((error as AppError).message).toContain('418');
  });
});

describe('callSolver — success path', () => {
  it('returns the parsed SolveResult unchanged on HTTP 200', async () => {
    const body: SolveResult = {
      status: 'OPTIMAL',
      assignments: [{ shift_id: 's1', worker_id: 'w1', assigned_by: 'algorithm' }],
      violations: [],
      warnings: [],
      solve_time_ms: 42,
    };
    fetchSpy.mockResolvedValueOnce(makeResponse(body, { status: 200 }));

    await expect(callSolver(makeRequest())).resolves.toEqual(body);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${SOLVER_URL}/solve`,
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('callSolver — malformed JSON', () => {
  it('throws AppError 502 ERR_SOLVER_MALFORMED_RESPONSE when 200 body is not JSON', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(null, { status: 200, throwOnJson: true }));

    await expect(callSolver(makeRequest())).rejects.toMatchObject({
      statusCode: 502,
      code: SOLVER_ERROR_CODES.MALFORMED_RESPONSE,
    });
  });
});
