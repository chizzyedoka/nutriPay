import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config.js';
import { prisma } from '../db.js';

const router = Router();
const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });

function setSession(response: Parameters<Parameters<typeof router.post>[1]>[1], userId: string) {
  const token = jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: '2h' });
  response.cookie('accessToken', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 2 * 60 * 60 * 1000 });
}

router.post('/register', async (request, response, next) => {
  try {
    const input = credentialsSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing) return response.status(409).json({ error: 'An account already exists' });
    const user = await prisma.user.create({ data: { email: input.email.toLowerCase(), passwordHash: await bcrypt.hash(input.password, 12) } });
    setSession(response, user.id);
    return response.status(201).json({ user: { id: user.id, email: user.email } });
  } catch (error) { return next(error); }
});

router.post('/login', async (request, response, next) => {
  try {
    const input = credentialsSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) return response.status(401).json({ error: 'Invalid credentials' });
    setSession(response, user.id);
    return response.json({ user: { id: user.id, email: user.email } });
  } catch (error) { return next(error); }
});

router.post('/logout', (_request, response) => response.clearCookie('accessToken').status(204).send());

export default router;
