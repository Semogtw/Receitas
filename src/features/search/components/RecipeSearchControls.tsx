import { Search, X } from 'lucide-react'
import type { RecipeCategory } from '../../recipes/data/category-repository'
import { EMPTY_RECIPE_SEARCH_QUERY, type RecipeSearchQuery } from '../domain/search'

interface RecipeSearchControlsProps {
  query: RecipeSearchQuery
  categories: readonly RecipeCategory[]
  resultCount: number
  totalCount: number
  onChange: (query: RecipeSearchQuery) => void
}

function sameQuery(left: RecipeSearchQuery, right: RecipeSearchQuery): boolean {
  return left.text === right.text
    && left.favorite === right.favorite
    && left.wantToMake === right.wantToMake
    && left.alreadyMade === right.alreadyMade
    && left.sort === right.sort
    && left.categoryIds.length === right.categoryIds.length
    && left.categoryIds.every((id, index) => id === right.categoryIds[index])
}

export function RecipeSearchControls({ query, categories, resultCount, totalCount, onChange }: RecipeSearchControlsProps) {
  const hasFilters = query.text.trim() !== ''
    || query.categoryIds.length > 0
    || query.favorite !== null
    || query.wantToMake !== null
    || query.alreadyMade !== null
  const isDefault = sameQuery(query, EMPTY_RECIPE_SEARCH_QUERY)

  function toggleCategory(id: string) {
    const selected = query.categoryIds.includes(id)
    onChange({
      ...query,
      categoryIds: selected
        ? query.categoryIds.filter((categoryId) => categoryId !== id)
        : [...query.categoryIds, id],
    })
  }

  function toggleState(key: 'favorite' | 'wantToMake' | 'alreadyMade') {
    onChange({ ...query, [key]: query[key] === true ? null : true })
  }

  return (
    <section className="recipe-search" aria-labelledby="recipe-search-title">
      <h2 id="recipe-search-title" className="sr-only">Buscar e filtrar receitas</h2>
      <div className="recipe-search__topline">
        <label className="recipe-search__input">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar receitas</span>
          <input
            type="search"
            value={query.text}
            onChange={(event) => onChange({ ...query, text: event.target.value })}
            placeholder="Buscar por receita, ingrediente ou categoria"
          />
          {query.text ? (
            <button type="button" onClick={() => onChange({ ...query, text: '' })} aria-label="Limpar busca">
              <X aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <label className="recipe-search__sort">
          <span>Ordenar</span>
          <select value={query.sort} onChange={(event) => onChange({ ...query, sort: event.target.value as RecipeSearchQuery['sort'] })}>
            <option value="recent">Mais recentes</option>
            <option value="name">Nome</option>
            <option value="most_prepared">Mais preparadas</option>
            <option value="best_rated">Melhor avaliadas</option>
          </select>
        </label>
      </div>

      <div className="recipe-search__states" aria-label="Filtros rápidos">
        <button type="button" data-active={query.favorite === true || undefined} aria-pressed={query.favorite === true} onClick={() => toggleState('favorite')}>Favoritas</button>
        <button type="button" data-active={query.wantToMake === true || undefined} aria-pressed={query.wantToMake === true} onClick={() => toggleState('wantToMake')}>Queremos fazer</button>
        <button type="button" data-active={query.alreadyMade === true || undefined} aria-pressed={query.alreadyMade === true} onClick={() => toggleState('alreadyMade')}>Já fizemos</button>
      </div>

      {categories.length > 0 ? (
        <details className="recipe-search__categories" open={query.categoryIds.length > 0 || undefined}>
          <summary>Categorias {query.categoryIds.length > 0 ? `(${query.categoryIds.length})` : ''}</summary>
          <div>
            {categories.map((category) => (
              <label key={category.id} data-active={query.categoryIds.includes(category.id) || undefined}>
                <input
                  type="checkbox"
                  checked={query.categoryIds.includes(category.id)}
                  onChange={() => toggleCategory(category.id)}
                />
                <span>{category.name}</span>
              </label>
            ))}
          </div>
        </details>
      ) : null}

      <footer className="recipe-search__footer">
        <span>{hasFilters ? `${resultCount} de ${totalCount} receitas` : `${totalCount} receitas`}</span>
        {!isDefault ? (
          <button type="button" onClick={() => onChange({ ...EMPTY_RECIPE_SEARCH_QUERY })}>Limpar filtros</button>
        ) : null}
      </footer>
    </section>
  )
}
