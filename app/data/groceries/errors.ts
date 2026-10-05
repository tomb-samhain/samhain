import { DataTableConstraintError, DataTableDatabaseError } from 'remix/data-table'

const SQLITE_CONSTRAINT_UNIQUE = 2067
const SQLITE_CONSTRAINT_PRIMARYKEY = 1555

export function isUniqueViolation(error: unknown): boolean {
  if (error instanceof DataTableConstraintError) return true
  if (!(error instanceof DataTableDatabaseError)) return false
  let cause = error.cause as { errcode?: number } | undefined
  return (
    cause?.errcode === SQLITE_CONSTRAINT_UNIQUE || cause?.errcode === SQLITE_CONSTRAINT_PRIMARYKEY
  )
}
