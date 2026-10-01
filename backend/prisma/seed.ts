import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const meals = [
    { slug: 'jollof-rice', name: 'Party jollof rice', description: 'Smoky tomato rice with sweet peppers, herbs, and a rich Nigerian party flavour.', imageUrl: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=85', caloriesPreview: 480, unlockPriceCents: 499, premiumNutrition: { calories: 480, protein: '38g', carbs: '42g', fat: '17g', fiber: '9g', portion: '1 plate / 420g', ingredients: ['Long-grain rice', 'Tomatoes', 'Red bell pepper', 'Chicken stock', 'Onion', 'Thyme'] } },
    { slug: 'beef-suya', name: 'Beef suya skewers', description: 'Charred beef skewers coated in warm yaji spice and served with crisp onions.', imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=85', caloriesPreview: 390, unlockPriceCents: 499, premiumNutrition: { calories: 390, protein: '21g', carbs: '55g', fat: '12g', fiber: '8g', portion: '3 skewers / 360g', ingredients: ['Beef fillet', 'Ground peanuts', 'Paprika', 'Ginger', 'Cayenne pepper', 'Red onion'] } },
    { slug: 'moi-moi', name: 'Steamed moi moi', description: 'Silky steamed bean pudding with peppers, onions, and a gentle savoury heat.', imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85', caloriesPreview: 430, unlockPriceCents: 499, premiumNutrition: { calories: 430, protein: '24g', carbs: '61g', fat: '11g', fiber: '14g', portion: '1 wrap / 300g', ingredients: ['Black-eyed beans', 'Red pepper', 'Onion', 'Palm oil', 'Stock', 'Dried crayfish'] } }
  ];
  for (const meal of meals) await prisma.meal.upsert({ where: { slug: meal.slug }, update: meal, create: meal });
}

main().finally(() => prisma.$disconnect());
