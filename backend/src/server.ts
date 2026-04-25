import 'dotenv/config';
import { connectDB } from './config/db';
import app from './app';
import { initCronService } from './services/cronService';

const PORT = process.env.PORT ?? 5001;

async function start(): Promise<void> {
  await connectDB();
  initCronService();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((err: Error) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
