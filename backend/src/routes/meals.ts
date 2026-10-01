import { Router } from 'express';
import type { Meal } from '@prisma/client';
import { prisma } from '../db.js';
import { hasMealEntitlement } from '../services/entitlements.js';
import { optionalAuth, type AuthenticatedRequest } from '../auth.js';

const router = Router();

router.get('/', async (_request, response, next) => {
  try {
    const meals = await prisma.meal.findMany({ orderBy: { name: 'asc' } });
    return response.json(meals.map((meal: Meal) => {
      const { premiumNutrition: _premiumNutrition, ...publicMeal } = meal;
      return publicMeal;
    }));
  } catch (error) { return next(error); }
});

router.get('/:id', optionalAuth, async (request: AuthenticatedRequest, response, next) => {
  try {
    const mealId = typeof request.params.id === 'string' ? request.params.id : request.params.id[0];
    const meal = await prisma.meal.findUnique({ where: { id: mealId } });
    if (!meal) return response.status(404).json({ error: 'Meal not found' });
    const unlocked = request.userId ? await hasMealEntitlement(request.userId, meal.id) : false;
    return response.json({ ...meal, premiumNutrition: unlocked ? meal.premiumNutrition : null, isLocked: !unlocked });
  } catch (error) { return next(error); }
});

export default router;
