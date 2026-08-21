import type { CatalogData } from '../domain/types'

export interface CatalogRepository {
  load(): Promise<CatalogData>
}

export class StaticCatalogRepository implements CatalogRepository {
  constructor(private readonly catalog: CatalogData) {}

  async load(): Promise<CatalogData> {
    return structuredClone(this.catalog)
  }
}

