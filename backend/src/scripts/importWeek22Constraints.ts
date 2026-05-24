import 'dotenv/config';
import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog';
import Constraint, { type IConstraintEntry } from '../models/Constraint';
import Notification from '../models/Notification';
import ShiftDefinition from '../models/ShiftDefinition';
import User, { type IUser } from '../models/User';
import WeeklySchedule from '../models/WeeklySchedule';
import { connectDB } from '../config/db';
import { toDateKey } from '../utils/weekUtils';

export const WEEK22_ID = '2026-W22';

export type Week22ShiftType = 'morning' | 'afternoon' | 'night';
export type ImportAction = 'created' | 'updated' | 'skipped';

export interface Week22ImageConstraint {
  employeeKey: string;
  employeeName: string;
  aliases: string[];
  date: string;
  day: string;
  shift: Week22ShiftType;
  canWork: false;
  availabilityType: 'unavailable';
}

export interface Week22ImportResult {
  employeeName: string;
  matchedUserName?: string;
  date: string;
  day: string;
  shift: Week22ShiftType;
  canWork: false;
  availabilityType: 'unavailable';
  action: ImportAction;
  applied: boolean;
  reason?: string;
}

export interface Week22ImportSummary {
  weekId: string;
  apply: boolean;
  scheduleFound: boolean;
  warnings: string[];
  results: Week22ImportResult[];
}

export interface ImportWeek22ConstraintsOptions {
  apply: boolean;
  managerEmail?: string;
  constraints?: Week22ImageConstraint[];
}

interface ResolvedConstraint {
  index: number;
  row: Week22ImageConstraint;
  user: IUser;
  definitionId: mongoose.Types.ObjectId;
}

const SHIFT_WINDOWS: Record<Week22ShiftType, { startTime: string; endTime: string }> = {
  morning: { startTime: '06:45', endTime: '14:45' },
  afternoon: { startTime: '14:45', endTime: '22:45' },
  night: { startTime: '22:45', endTime: '06:45' },
};

export const WEEK22_IMAGE_CONSTRAINTS: Week22ImageConstraint[] = [
  row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-24', 'Sunday', 'morning'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-24', 'Sunday', 'morning'),
  row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-24', 'Sunday', 'night'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-24', 'Sunday', 'night'),

  row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-25', 'Monday', 'morning'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-25', 'Monday', 'morning'),
  row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-25', 'Monday', 'afternoon'),
  row('ofek', 'Ofek / אופק', ['Ofek', 'אופק'], '2026-05-25', 'Monday', 'afternoon'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-25', 'Monday', 'afternoon'),
  row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-25', 'Monday', 'night'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-25', 'Monday', 'night'),

  row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-26', 'Tuesday', 'morning'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-26', 'Tuesday', 'morning'),
  row('ofek', 'Ofek / אופק', ['Ofek', 'אופק'], '2026-05-26', 'Tuesday', 'afternoon'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-26', 'Tuesday', 'afternoon'),
  row('ofek', 'Ofek / אופק', ['Ofek', 'אופק'], '2026-05-26', 'Tuesday', 'night'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-26', 'Tuesday', 'night'),

  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-27', 'Wednesday', 'morning'),
  row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-27', 'Wednesday', 'afternoon'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-27', 'Wednesday', 'afternoon'),
  row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-27', 'Wednesday', 'night'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-27', 'Wednesday', 'night'),

  row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-28', 'Thursday', 'morning'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-28', 'Thursday', 'afternoon'),
  row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-28', 'Thursday', 'night'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-28', 'Thursday', 'night'),

  row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-29', 'Friday', 'morning'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-29', 'Friday', 'morning'),
  row('ofek', 'Ofek / אופק', ['Ofek', 'אופק'], '2026-05-29', 'Friday', 'afternoon'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-29', 'Friday', 'afternoon'),
  row('ofek', 'Ofek / אופק', ['Ofek', 'אופק'], '2026-05-29', 'Friday', 'night'),

  row('ofek', 'Ofek / אופק', ['Ofek', 'אופק'], '2026-05-30', 'Saturday', 'morning'),
  row('ofek', 'Ofek / אופק', ['Ofek', 'אופק'], '2026-05-30', 'Saturday', 'afternoon'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-30', 'Saturday', 'afternoon'),
  row('bar', 'Bar / בר', ['Bar', 'בר'], '2026-05-30', 'Saturday', 'night'),
  row('shahar', 'Shahar / שחר', ['Shahar', 'שחר'], '2026-05-30', 'Saturday', 'night'),
];

function row(
  employeeKey: string,
  employeeName: string,
  aliases: string[],
  date: string,
  day: string,
  shift: Week22ShiftType
): Week22ImageConstraint {
  return {
    employeeKey,
    employeeName,
    aliases,
    date,
    day,
    shift,
    canWork: false,
    availabilityType: 'unavailable',
  };
}

function normalizeLookup(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[\s._\-'"`״׳]/g, '');
}

function parseLocalDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function sameEntry(
  entry: IConstraintEntry,
  dateKey: string,
  definitionId: mongoose.Types.ObjectId
): boolean {
  return (
    toDateKey(entry.date) === dateKey && entry.definitionId.toString() === definitionId.toString()
  );
}

function isAlreadyUnavailable(entry: IConstraintEntry): boolean {
  return (
    entry.canWork === false &&
    entry.availabilityType === 'unavailable' &&
    !entry.startTime &&
    !entry.endTime
  );
}

async function resolveShiftDefinitions(): Promise<
  Record<Week22ShiftType, mongoose.Types.ObjectId>
> {
  const definitions = await ShiftDefinition.find({ isActive: true }).sort({ orderNumber: 1 });

  return (Object.keys(SHIFT_WINDOWS) as Week22ShiftType[]).reduce(
    (acc, shift) => {
      const expected = SHIFT_WINDOWS[shift];
      const definition = definitions.find(
        (def) => def.startTime === expected.startTime && def.endTime === expected.endTime
      );

      if (!definition) {
        throw new Error(
          `Missing active ShiftDefinition for ${shift} (${expected.startTime}-${expected.endTime})`
        );
      }

      acc[shift] = definition._id as mongoose.Types.ObjectId;
      return acc;
    },
    {} as Record<Week22ShiftType, mongoose.Types.ObjectId>
  );
}

async function resolveUsers(): Promise<Map<string, IUser>> {
  const users = await User.find({
    isActive: true,
    role: { $in: ['employee', 'manager'] },
  });
  const byAlias = new Map<string, IUser>();

  for (const user of users) {
    byAlias.set(normalizeLookup(user.name), user);
    const emailLocalPart = user.email.split('@')[0];
    byAlias.set(normalizeLookup(emailLocalPart), user);
  }

  return byAlias;
}

async function resolveManager(managerEmail?: string): Promise<IUser | null> {
  const roleFilter = { $in: ['manager', 'admin'] };
  if (managerEmail) {
    return User.findOne({
      email: managerEmail.toLocaleLowerCase('en-US'),
      isActive: true,
      role: roleFilter,
    });
  }

  return User.findOne({ isActive: true, role: roleFilter }).sort({ role: 1, createdAt: 1 });
}

function matchUser(
  rowToMatch: Week22ImageConstraint,
  usersByAlias: Map<string, IUser>
): IUser | null {
  for (const alias of [rowToMatch.employeeKey, rowToMatch.employeeName, ...rowToMatch.aliases]) {
    const user = usersByAlias.get(normalizeLookup(alias));
    if (user) return user;
  }
  return null;
}

function makeEntry(
  rowToImport: Week22ImageConstraint,
  definitionId: mongoose.Types.ObjectId
): IConstraintEntry {
  return {
    date: parseLocalDateKey(rowToImport.date),
    definitionId,
    canWork: false,
    availabilityType: 'unavailable',
  };
}

function resultFor(
  rowToImport: Week22ImageConstraint,
  action: ImportAction,
  applied: boolean,
  options: { matchedUserName?: string; reason?: string } = {}
): Week22ImportResult {
  return {
    employeeName: rowToImport.employeeName,
    matchedUserName: options.matchedUserName,
    date: rowToImport.date,
    day: rowToImport.day,
    shift: rowToImport.shift,
    canWork: false,
    availabilityType: 'unavailable',
    action,
    applied,
    reason: options.reason,
  };
}

export async function importWeek22Constraints(
  options: ImportWeek22ConstraintsOptions
): Promise<Week22ImportSummary> {
  const sourceRows = options.constraints ?? WEEK22_IMAGE_CONSTRAINTS;
  const warnings: string[] = [];
  const schedule = await WeeklySchedule.findOne({ weekId: WEEK22_ID }).lean();
  if (!schedule) {
    warnings.push(
      `No WeeklySchedule found for ${WEEK22_ID}; constraints will still target weekId.`
    );
  }

  const [definitionsByShift, usersByAlias] = await Promise.all([
    resolveShiftDefinitions(),
    resolveUsers(),
  ]);

  const manager = options.apply ? await resolveManager(options.managerEmail) : null;
  if (options.apply && !manager) {
    const suffix = options.managerEmail ? ` for ${options.managerEmail}` : '';
    throw new Error(`No active manager/admin user found${suffix}; pass --manager-email=<email>.`);
  }

  const results: Array<Week22ImportResult | undefined> = new Array(sourceRows.length);
  const resolved: ResolvedConstraint[] = [];
  const seen = new Set<string>();

  for (const [index, sourceRow] of sourceRows.entries()) {
    const user = matchUser(sourceRow, usersByAlias);
    if (!user) {
      results[index] = resultFor(sourceRow, 'skipped', false, { reason: 'employee_not_found' });
      continue;
    }

    const definitionId = definitionsByShift[sourceRow.shift];
    const dedupeKey = `${user._id.toString()}|${sourceRow.date}|${definitionId.toString()}`;
    if (seen.has(dedupeKey)) {
      results[index] = resultFor(sourceRow, 'skipped', false, {
        matchedUserName: user.name,
        reason: 'duplicate_input',
      });
      continue;
    }

    seen.add(dedupeKey);
    resolved.push({ index, row: sourceRow, user, definitionId });
  }

  const byUser = new Map<string, ResolvedConstraint[]>();
  for (const resolvedRow of resolved) {
    const userId = resolvedRow.user._id.toString();
    byUser.set(userId, [...(byUser.get(userId) ?? []), resolvedRow]);
  }

  for (const rowsForUser of byUser.values()) {
    const user = rowsForUser[0].user;
    const existing = await Constraint.findOne({ userId: user._id, weekId: WEEK22_ID });
    const nextEntries: IConstraintEntry[] = (existing?.entries ?? []).map((entry) => ({
      date: entry.date,
      definitionId: entry.definitionId,
      canWork: entry.canWork,
      availabilityType: entry.availabilityType,
      startTime: entry.startTime,
      endTime: entry.endTime,
      note: entry.note,
    }));

    let hasChanges = false;

    for (const resolvedRow of rowsForUser) {
      const index = nextEntries.findIndex((entry) =>
        sameEntry(entry, resolvedRow.row.date, resolvedRow.definitionId)
      );

      if (index === -1) {
        nextEntries.push(makeEntry(resolvedRow.row, resolvedRow.definitionId));
        hasChanges = true;
        results[resolvedRow.index] = resultFor(resolvedRow.row, 'created', options.apply, {
          matchedUserName: user.name,
        });
        continue;
      }

      if (isAlreadyUnavailable(nextEntries[index])) {
        results[resolvedRow.index] = resultFor(resolvedRow.row, 'skipped', false, {
          matchedUserName: user.name,
          reason: 'already_unavailable',
        });
        continue;
      }

      nextEntries[index] = makeEntry(resolvedRow.row, resolvedRow.definitionId);
      hasChanges = true;
      results[resolvedRow.index] = resultFor(resolvedRow.row, 'updated', options.apply, {
        matchedUserName: user.name,
      });
    }

    if (!options.apply || !hasChanges) continue;

    const now = new Date();
    const constraint = existing ?? new Constraint({ userId: user._id, weekId: WEEK22_ID });
    constraint.entries = nextEntries;
    constraint.submittedVia = 'manager_override';
    constraint.overriddenBy = manager!._id as mongoose.Types.ObjectId;
    constraint.submittedAt = now;
    constraint.isLocked = false;
    await constraint.save();

    await AuditLog.create({
      performedBy: manager!._id,
      action: 'constraint_override',
      targetUserId: user._id,
      refModel: 'Constraint',
      refId: constraint._id,
      after: { entries: nextEntries, source: 'importWeek22Constraints' },
      ip: 'script',
    });

    await Notification.create({
      userId: user._id,
      type: 'constraint_updated',
      title: 'אילוצים עודכנו על ידי המנהל',
      body: `המנהל עדכן את האילוצים שלך לשבוע ${WEEK22_ID}`,
      refModel: 'Constraint',
      refId: constraint._id,
    });
  }

  return {
    weekId: WEEK22_ID,
    apply: options.apply,
    scheduleFound: !!schedule,
    warnings,
    results: results.filter((result): result is Week22ImportResult => result !== undefined),
  };
}

function parseArgs(argv: string[]): { apply: boolean; managerEmail?: string; help: boolean } {
  return argv.reduce(
    (acc, arg) => {
      if (arg === '--apply') return { ...acc, apply: true };
      if (arg === '--help' || arg === '-h') return { ...acc, help: true };
      if (arg.startsWith('--manager-email=')) {
        return { ...acc, managerEmail: arg.slice('--manager-email='.length) };
      }
      throw new Error(`Unknown argument: ${arg}`);
    },
    { apply: false, help: false } as { apply: boolean; managerEmail?: string; help: boolean }
  );
}

function printUsage(): void {
  console.log(`Usage:
  npm run import:week22-constraints --workspace=backend
  npm run import:week22-constraints --workspace=backend -- --apply --manager-email=manager@example.com

Default mode is a dry run. Add --apply to write create/update changes.`);
}

function printParsedTable(rows: Week22ImageConstraint[]): void {
  console.log('Parsed constraints from image:');
  console.table(
    rows.map((sourceRow) => ({
      employee: sourceRow.employeeName,
      date: sourceRow.date,
      day: sourceRow.day,
      shift: sourceRow.shift,
      canWork: sourceRow.canWork,
    }))
  );
}

function printSummary(summary: Week22ImportSummary): void {
  if (summary.warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of summary.warnings) console.log(`- ${warning}`);
  }

  console.log(summary.apply ? 'DB write mode: apply' : 'DB write mode: dry run');
  console.table(
    summary.results.map((result) => ({
      employee: result.employeeName,
      matchedUser: result.matchedUserName ?? '',
      date: result.date,
      day: result.day,
      shift: result.shift,
      action: result.action,
      applied: result.applied,
      reason: result.reason ?? '',
    }))
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  await connectDB();
  try {
    printParsedTable(WEEK22_IMAGE_CONSTRAINTS);
    const summary = await importWeek22Constraints({
      apply: args.apply,
      managerEmail: args.managerEmail,
    });
    printSummary(summary);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Week 22 constraint import failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
