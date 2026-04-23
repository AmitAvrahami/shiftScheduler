import { Request, Response, NextFunction } from 'express';
import ShiftDefinition from '../models/ShiftDefinition';

export async function getActiveShiftDefinitions(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const definitions = await ShiftDefinition.find({ isActive: true }).sort({ orderNumber: 1 });
    res.json({ success: true, definitions });
  } catch (err) {
    next(err);
  }
}
