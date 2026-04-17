import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { connectDB } from './config/db';
import router from './routes/index';
import { errorHandler } from './middleware/errorMiddleware';

const app = express();

app.use(cors({ origin: process.env.ALLOWED_ORIGIN }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', router);

app.use(errorHandler);

const PORT = process.env.PORT ?? 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

connectDB().catch((err: Error) => {
  console.error('Failed to connect to MongoDB:', err.message);
});
