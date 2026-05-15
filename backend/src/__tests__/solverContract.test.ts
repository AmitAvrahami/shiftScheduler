import fs from 'fs';
import path from 'path';
import { SolveRequest, SolveResult } from '../services/solverClient';

const FIXTURES_DIR = path.resolve(__dirname, '../../__fixtures__');

function loadFixture<T>(filename: string): T {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8');
  return JSON.parse(raw) as T;
}

describe('solver cross-runtime contract', () => {
  describe('valid_solve_request.json', () => {
    const request = loadFixture<SolveRequest>('valid_solve_request.json');

    it('exposes the expected snake_case fields on the root', () => {
      expect(typeof request.schedule_id).toBe('string');
      expect(request.schedule_id).toBe('schedule_contract_test');
      expect(typeof request.week_id).toBe('string');
      expect(request.week_id).toBe('2026-W18');
      expect(Array.isArray(request.workers)).toBe(true);
      expect(Array.isArray(request.shift_definitions)).toBe(true);
      expect(Array.isArray(request.shifts)).toBe(true);
    });

    it('exposes the expected snake_case fields on nested shapes', () => {
      const worker = request.workers[0];
      expect(typeof worker.is_fixed_morning).toBe('boolean');
      expect(worker.availability[0].definition_id).toBe('shift_def_morning');
      expect(worker.availability[0].can_work).toBe(true);

      const def = request.shift_definitions[0];
      expect(def.start_time).toBe('06:00');
      expect(def.end_time).toBe('14:00');
      expect(def.duration_minutes).toBe(480);
      expect(def.crosses_midnight).toBe(false);

      const shift = request.shifts[0];
      expect(shift.definition_id).toBe('shift_def_morning');
      expect(shift.required_count).toBe(1);
    });

    it('does not contain camelCase drift', () => {
      const root = request as unknown as Record<string, unknown>;
      expect(root).not.toHaveProperty('scheduleId');
      expect(root).not.toHaveProperty('weekId');
      expect(root).not.toHaveProperty('shiftDefinitions');

      const worker = request.workers[0] as unknown as Record<string, unknown>;
      expect(worker).not.toHaveProperty('isFixedMorning');

      const availability = request.workers[0].availability[0] as unknown as Record<string, unknown>;
      expect(availability).not.toHaveProperty('definitionId');
      expect(availability).not.toHaveProperty('canWork');

      const def = request.shift_definitions[0] as unknown as Record<string, unknown>;
      expect(def).not.toHaveProperty('startTime');
      expect(def).not.toHaveProperty('endTime');
      expect(def).not.toHaveProperty('durationMinutes');
      expect(def).not.toHaveProperty('crossesMidnight');

      const shift = request.shifts[0] as unknown as Record<string, unknown>;
      expect(shift).not.toHaveProperty('definitionId');
      expect(shift).not.toHaveProperty('requiredCount');
    });
  });

  describe('PR #3 generic payload fields', () => {
    it('SolveRequest accepts snake_case forbidden_assignments, penalties, and relaxation_weights', () => {
      const augmented: SolveRequest = {
        ...loadFixture<SolveRequest>('valid_solve_request.json'),
        forbidden_assignments: [{ worker_id: 'w1', shift_id: 's1' }],
        penalties: [
          {
            category: 'assignment_preference',
            weight: 10,
            worker_id: 'w1',
            shift_id: 's1',
          },
        ],
        relaxation_weights: { load: 10000, coverage: 10000 },
      };

      const serialized = JSON.parse(JSON.stringify(augmented)) as Record<string, unknown>;

      expect(serialized).toHaveProperty('forbidden_assignments');
      expect(serialized).toHaveProperty('penalties');
      expect(serialized).toHaveProperty('relaxation_weights');

      const forbidden = (serialized.forbidden_assignments as Array<Record<string, unknown>>)[0];
      expect(forbidden).toHaveProperty('worker_id');
      expect(forbidden).toHaveProperty('shift_id');
      expect(forbidden).not.toHaveProperty('workerId');
      expect(forbidden).not.toHaveProperty('shiftId');

      const penalty = (serialized.penalties as Array<Record<string, unknown>>)[0];
      expect(penalty).toHaveProperty('category');
      expect(penalty).toHaveProperty('weight');
      expect(penalty).toHaveProperty('worker_id');
      expect(penalty).toHaveProperty('shift_id');

      const weights = serialized.relaxation_weights as Record<string, unknown>;
      expect(weights).toHaveProperty('load');
      expect(weights).toHaveProperty('coverage');
    });
  });

  describe('valid_solve_result.json', () => {
    const result = loadFixture<SolveResult>('valid_solve_result.json');

    it('exposes the expected snake_case fields', () => {
      expect(result.status).toBe('FEASIBLE');
      expect(Array.isArray(result.assignments)).toBe(true);
      expect(Array.isArray(result.violations)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(typeof result.solve_time_ms).toBe('number');
      expect(result.solve_time_ms).toBe(12);

      const assignment = result.assignments[0];
      expect(assignment.shift_id).toBe('shift_1');
      expect(assignment.worker_id).toBe('worker_1');
      expect(assignment.assigned_by).toBe('algorithm');

      const warning = result.warnings[0];
      expect(warning.constraint_id).toBe('CONTRACT_TEST_WARNING');
      expect(warning.worker_id).toBe('worker_1');
      expect(warning.message).toBe('Contract test warning');
    });

    it('does not contain camelCase drift', () => {
      const root = result as unknown as Record<string, unknown>;
      expect(root).not.toHaveProperty('solveTimeMs');

      const assignment = result.assignments[0] as unknown as Record<string, unknown>;
      expect(assignment).not.toHaveProperty('shiftId');
      expect(assignment).not.toHaveProperty('workerId');
      expect(assignment).not.toHaveProperty('assignedBy');

      const warning = result.warnings[0] as unknown as Record<string, unknown>;
      expect(warning).not.toHaveProperty('constraintId');
      expect(warning).not.toHaveProperty('workerId');
    });
  });
});
