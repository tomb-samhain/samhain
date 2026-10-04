import { and, inList, type Database } from 'remix/data-table'

import { isUniqueViolation } from './errors.ts'
import {
  consolidate,
  normalizeIngredientName,
  parseIngredient,
  type ConsolidatedIngredient,
} from './ingredients.ts'
import { ingredients, meals, type Ingredient } from './tables.ts'

// Every function takes the signed-in user's id and treats another user's rows as missing,
// matching MealService's findByIdAndUserId/existsByIdAndUserId checks.

export interface MealSummary {
  id: number
  name: string
  ingredientCount: number
}

export interface MealDetail {
  id: number
  name: string
  ingredients: Ingredient[]
}

export type Result<value = void> = { ok: true; value: value } | { ok: false; error: string }

export async function listMeals(db: Database, userId: number): Promise<MealSummary[]> {
  let rows = await db.findMany(meals, { where: { user_id: userId } })
  let counts = new Map<number, number>()
  if (rows.length > 0) {
    let items = await db.findMany(ingredients, {
      where: inList(
        'meal_id',
        rows.map((m) => m.id),
      ),
    })
    for (let item of items) counts.set(item.meal_id, (counts.get(item.meal_id) ?? 0) + 1)
  }

  return rows
    .map((meal) => ({ id: meal.id, name: meal.name, ingredientCount: counts.get(meal.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id - b.id)
}

export async function getMeal(
  db: Database,
  userId: number,
  mealId: number,
): Promise<MealDetail | null> {
  let meal = await findOwnedMeal(db, userId, mealId)
  if (!meal) return null
  let items = await db.findMany(ingredients, {
    where: { meal_id: meal.id },
    orderBy: ['id', 'asc'],
  })
  return { id: meal.id, name: meal.name, ingredients: items }
}

export async function createMeal(
  db: Database,
  userId: number,
  name: string,
): Promise<Result<{ id: number }>> {
  let trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Enter a name for the meal.' }
  try {
    let meal = await db.create(meals, { user_id: userId, name: trimmed }, { returnRow: true })
    return { ok: true, value: { id: meal.id } }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: duplicateMealMessage(trimmed) }
    throw error
  }
}

export async function renameMeal(
  db: Database,
  userId: number,
  mealId: number,
  name: string,
): Promise<Result | null> {
  let meal = await findOwnedMeal(db, userId, mealId)
  if (!meal) return null
  let trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Enter a name for the meal.' }
  try {
    await db.update(meals, meal.id, { name: trimmed })
    return { ok: true, value: undefined }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: duplicateMealMessage(trimmed) }
    throw error
  }
}

export async function deleteMeal(db: Database, userId: number, mealId: number): Promise<boolean> {
  let meal = await findOwnedMeal(db, userId, mealId)
  if (!meal) return false
  return db.delete(meals, meal.id)
}

export async function addIngredient(
  db: Database,
  userId: number,
  mealId: number,
  raw: string,
): Promise<Result | null> {
  let meal = await findOwnedMeal(db, userId, mealId)
  if (!meal) return null
  if (!raw.trim()) return { ok: false, error: 'Enter an ingredient.' }

  let { name, quantity } = parseIngredient(raw)
  try {
    await db.create(ingredients, { meal_id: meal.id, name, quantity })
    return { ok: true, value: undefined }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: duplicateIngredientMessage(name) }
    throw error
  }
}

export interface IngredientChanges {
  name?: string
  // An empty string clears the quantity (the Spring API could not clear it).
  quantity?: string
}

export async function updateIngredient(
  db: Database,
  userId: number,
  mealId: number,
  ingredientId: number,
  changes: IngredientChanges,
): Promise<Result | null> {
  let ingredient = await findOwnedIngredient(db, userId, mealId, ingredientId)
  if (!ingredient) return null

  let update: { name?: string; quantity?: string | null } = {}
  if (changes.name !== undefined) {
    let name = changes.name.trim()
    if (!name) return { ok: false, error: 'Enter an ingredient name.' }
    update.name = name
  }
  if (changes.quantity !== undefined) update.quantity = changes.quantity.trim() || null

  try {
    await db.update(ingredients, ingredient.id, update)
    return { ok: true, value: undefined }
  } catch (error) {
    if (isUniqueViolation(error))
      return { ok: false, error: duplicateIngredientMessage(update.name ?? ingredient.name) }
    throw error
  }
}

export async function deleteIngredient(
  db: Database,
  userId: number,
  mealId: number,
  ingredientId: number,
): Promise<boolean> {
  let ingredient = await findOwnedIngredient(db, userId, mealId, ingredientId)
  if (!ingredient) return false
  return db.delete(ingredients, ingredient.id)
}

export interface LinkedProduct {
  productId: string
  productName: string
}

export async function linkIngredient(
  db: Database,
  userId: number,
  mealId: number,
  ingredientId: number,
  product: LinkedProduct,
): Promise<boolean> {
  let ingredient = await findOwnedIngredient(db, userId, mealId, ingredientId)
  if (!ingredient) return false
  await db.update(ingredients, ingredient.id, {
    kroger_product_id: product.productId,
    kroger_product_name: product.productName,
  })
  return true
}

// Links every ingredient whose normalized name matches across the given meals
// (MealService.linkProduct). Returns false if any meal is missing.
export async function linkProductAcrossMeals(
  db: Database,
  userId: number,
  mealIds: number[],
  name: string,
  product: LinkedProduct,
): Promise<boolean> {
  let owned = await findOwnedMeals(db, userId, mealIds)
  if (!owned) return false

  let key = normalizeIngredientName(name)
  await db.transaction(async (tx) => {
    for (let meal of owned) {
      let items = await tx.findMany(ingredients, { where: { meal_id: meal.id } })
      for (let item of items) {
        if (normalizeIngredientName(item.name) !== key) continue
        await tx.update(ingredients, item.id, {
          kroger_product_id: product.productId,
          kroger_product_name: product.productName,
        })
      }
    }
  })
  return true
}

// Returns null if any meal is missing or belongs to another user.
export async function consolidateMeals(
  db: Database,
  userId: number,
  mealIds: number[],
): Promise<ConsolidatedIngredient[] | null> {
  let owned = await findOwnedMeals(db, userId, mealIds)
  if (!owned) return null

  let all: Ingredient[] = []
  for (let meal of owned) {
    all.push(
      ...(await db.findMany(ingredients, { where: { meal_id: meal.id }, orderBy: ['id', 'asc'] })),
    )
  }
  return consolidate(all)
}

function findOwnedMeal(db: Database, userId: number, mealId: number) {
  return db.findOne(meals, { where: { id: mealId, user_id: userId } })
}

// Meals in the requested order, without duplicates.
async function findOwnedMeals(db: Database, userId: number, mealIds: number[]) {
  let ids = [...new Set(mealIds)]
  if (ids.length === 0) return []
  let rows = await db.findMany(meals, { where: and({ user_id: userId }, inList('id', ids)) })
  if (rows.length !== ids.length) return null
  let byId = new Map(rows.map((row) => [row.id, row]))
  return ids.map((id) => byId.get(id)!)
}

async function findOwnedIngredient(
  db: Database,
  userId: number,
  mealId: number,
  ingredientId: number,
) {
  let meal = await findOwnedMeal(db, userId, mealId)
  if (!meal) return null
  return db.findOne(ingredients, { where: { id: ingredientId, meal_id: meal.id } })
}

function duplicateMealMessage(name: string) {
  return `You already have a meal named "${name}".`
}

function duplicateIngredientMessage(name: string) {
  return `"${name}" is already in this meal.`
}
