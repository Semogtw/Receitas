import { column, Schema, Table } from '@powersync/web'

export const SYNCABLE_ENTITY_TYPES = [
  'recipes',
  'recipe_ingredients',
  'recipe_steps',
  'categories',
  'recipe_categories',
  'recipe_photos',
  'cooking_sessions',
  'cooking_session_ratings',
  'cooking_session_photos',
  'ingredient_conversion_profiles',
  'imports',
  'meal_periods',
  'meal_plan_entries',
  'shopping_lists',
  'shopping_items',
] as const

export type SyncableEntityType = (typeof SYNCABLE_ENTITY_TYPES)[number]

const common = {
  pair_id: column.text,
  revision: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
}

const recipes = new Table({
  ...common,
  title: column.text,
  description: column.text,
  base_yield_numerator: column.integer,
  base_yield_denominator: column.integer,
  base_yield_unit: column.text,
  prep_time_seconds: column.integer,
  cook_time_seconds: column.integer,
  total_time_seconds: column.integer,
  favorite: column.integer,
  want_to_make: column.integer,
  source_kind: column.text,
  source_url: column.text,
  created_by: column.text,
}, { indexes: { pair_updated: ['pair_id', '-updated_at'] } })

const recipe_ingredients = new Table({
  ...common,
  recipe_id: column.text,
  position: column.integer,
  quantity_numerator: column.integer,
  quantity_denominator: column.integer,
  quantity_text: column.text,
  unit: column.text,
  ingredient_name: column.text,
  normalized_name: column.text,
  note: column.text,
  is_approximate: column.integer,
  is_optional: column.integer,
}, { indexes: { recipe_position: ['recipe_id', 'position'], pair_name: ['pair_id', 'normalized_name'] } })

const recipe_steps = new Table({
  ...common,
  recipe_id: column.text,
  position: column.integer,
  instruction: column.text,
  duration_seconds: column.integer,
  observation: column.text,
}, { indexes: { recipe_position: ['recipe_id', 'position'] } })

const categories = new Table({ ...common, name: column.text }, { indexes: { pair_name: ['pair_id', 'name'] } })

const recipe_categories = new Table({
  ...common,
  recipe_id: column.text,
  category_id: column.text,
}, { indexes: { recipe: ['recipe_id'], category: ['category_id'] } })

const recipe_photos = new Table({
  ...common,
  recipe_id: column.text,
  storage_path: column.text,
  storage_state: column.text,
  mime_type: column.text,
  byte_size: column.integer,
  width: column.integer,
  height: column.integer,
  sha256: column.text,
  position: column.integer,
  is_cover: column.integer,
  created_by: column.text,
}, { indexes: { recipe_position: ['recipe_id', 'position'] } })

const cooking_sessions = new Table({
  ...common,
  recipe_id: column.text,
  recorded_by: column.text,
  started_at: column.text,
  prepared_at: column.text,
  prepared_yield_numerator: column.integer,
  prepared_yield_denominator: column.integer,
  shared_observation: column.text,
  recipe_snapshot_version: column.integer,
  recipe_snapshot: column.text,
}, { indexes: { recipe_prepared: ['recipe_id', '-prepared_at'], pair_prepared: ['pair_id', '-prepared_at'] } })

const cooking_session_ratings = new Table({
  ...common,
  cooking_session_id: column.text,
  user_id: column.text,
  score: column.real,
  comment: column.text,
}, { indexes: { session_user: ['cooking_session_id', 'user_id'] } })

const cooking_session_photos = new Table({
  ...common,
  cooking_session_id: column.text,
  storage_path: column.text,
  storage_state: column.text,
  mime_type: column.text,
  byte_size: column.integer,
  width: column.integer,
  height: column.integer,
  sha256: column.text,
  position: column.integer,
  created_by: column.text,
}, { indexes: { session_position: ['cooking_session_id', 'position'] } })

const ingredient_conversion_profiles = new Table({
  ...common,
  ingredient_normalized_name: column.text,
  from_unit: column.text,
  to_unit: column.text,
  factor_numerator: column.integer,
  factor_denominator: column.integer,
  is_approximate: column.integer,
  source_note: column.text,
}, { indexes: { pair_ingredient: ['pair_id', 'ingredient_normalized_name'] } })

const imports = new Table({
  ...common,
  created_by: column.text,
  source_kind: column.text,
  source_url: column.text,
  status: column.text,
  parser_strategy: column.text,
  extracted_payload: column.text,
  extraction_errors: column.text,
  saved_recipe_id: column.text,
}, { indexes: { pair_created: ['pair_id', '-created_at'] } })

const meal_periods = new Table({
  ...common,
  name: column.text,
  position: column.integer,
}, { indexes: { pair_position: ['pair_id', 'position'] } })

const meal_plan_entries = new Table({
  ...common,
  recipe_id: column.text,
  meal_period_id: column.text,
  planned_date: column.text,
  planned_time: column.text,
  servings_numerator: column.integer,
  servings_denominator: column.integer,
  note: column.text,
}, { indexes: { pair_date: ['pair_id', 'planned_date', 'planned_time'] } })

const shopping_lists = new Table({
  ...common,
  name: column.text,
  is_default: column.integer,
  completed_at: column.text,
}, { indexes: { pair_updated: ['pair_id', '-updated_at'] } })

const shopping_items = new Table({
  ...common,
  shopping_list_id: column.text,
  item_name: column.text,
  normalized_name: column.text,
  quantity_numerator: column.integer,
  quantity_denominator: column.integer,
  quantity_text: column.text,
  unit: column.text,
  checked: column.integer,
  source_kind: column.text,
  source_refs: column.text,
  position: column.integer,
}, { indexes: { list_position: ['shopping_list_id', 'checked', 'position'], pair_name: ['pair_id', 'normalized_name'] } })

const conflicts = new Table({
  pair_id: column.text,
  entity_type: column.text,
  entity_id: column.text,
  base_revision: column.integer,
  base_payload: column.text,
  local_payload: column.text,
  remote_payload: column.text,
  status: column.text,
  resolution_strategy: column.text,
  resolution_payload: column.text,
  resolved_by: column.text,
  created_at: column.text,
  resolved_at: column.text,
}, { indexes: { pair_status: ['pair_id', 'status', '-created_at'], entity: ['pair_id', 'entity_type', 'entity_id'] } })

const mutation_outbox = Table.createLocalOnly({
  pair_id: column.text,
  actor_user_id: column.text,
  entity_type: column.text,
  entity_id: column.text,
  operation: column.text,
  base_revision: column.integer,
  base_payload: column.text,
  next_payload: column.text,
  created_at: column.text,
  attempt_count: column.integer,
  last_error: column.text,
}, { indexes: { created: ['created_at'], entity: ['entity_type', 'entity_id'] } })

const device_preferences = Table.createLocalOnly({
  value_json: column.text,
  updated_at: column.text,
})

export const AppSchema = new Schema({
  recipes,
  recipe_ingredients,
  recipe_steps,
  categories,
  recipe_categories,
  recipe_photos,
  cooking_sessions,
  cooking_session_ratings,
  cooking_session_photos,
  ingredient_conversion_profiles,
  imports,
  meal_periods,
  meal_plan_entries,
  shopping_lists,
  shopping_items,
  conflicts,
  mutation_outbox,
  device_preferences,
})

AppSchema.validate()

export type LocalDatabase = (typeof AppSchema)['types']
