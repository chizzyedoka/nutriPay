import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config.js';
import authRoutes from './routes/auth.js';
import billingRoutes from './routes/billing.js';
import mealRoutes from './routes/meals.js';
import paymentRoutes from './routes/payments.js';
import webhookRoutes from './routes/webhooks.js';

export const app = express();
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), webhookRoutes);
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 60_000, limit: 100 }));
app.get('/api/health', (_request, response) => response.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/meals', mealRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/billing', billingRoutes);

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error?.name === 'ZodError') return response.status(400).json({ error: 'Invalid request' });
  console.error(error);
  return response.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);
