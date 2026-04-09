import express from 'express';
import uploadRouter from './routes/upload';

const app = express();

app.use(express.json());
app.use('/api', uploadRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;