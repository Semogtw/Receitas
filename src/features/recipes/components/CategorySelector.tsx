import type { RecipeCategory } from '../data/category-repository'

interface CategorySelectorProps {
  categories: readonly RecipeCategory[]
  selectedIds: readonly string[]
  onChange(ids: string[]): void
}

export function CategorySelector({ categories, selectedIds, onChange }: CategorySelectorProps) {
  if (categories.length === 0) {
    return <p className="recipe-editor__empty">Nenhuma categoria cadastrada ainda.</p>
  }

  const selected = new Set(selectedIds)

  function toggle(id: string, checked: boolean): void {
    if (checked) {
      onChange(categories.filter((category) => selected.has(category.id) || category.id === id).map((category) => category.id))
      return
    }
    onChange(selectedIds.filter((selectedId) => selectedId !== id))
  }

  return (
    <fieldset className="category-selector">
      <legend>Categorias</legend>
      <div className="category-selector__options">
        {categories.map((category) => (
          <label key={category.id}>
            <input
              type="checkbox"
              checked={selected.has(category.id)}
              onChange={(event) => toggle(category.id, event.currentTarget.checked)}
            />
            <span>{category.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
