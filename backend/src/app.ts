import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import router from './routes/index';
import { errorHandler } from './middleware/errorMiddleware';
import { logger } from './utils/logger';

const app = express();

app.use(cors({ origin: process.env.ALLOWED_ORIGIN }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging Middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, req.body);
  next();
});

app.use('/api/v1', router);
app.use('/api', router);
app.use(errorHandler);

export default app;
