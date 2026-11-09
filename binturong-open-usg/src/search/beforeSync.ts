import type { BeforeSync, DocToSync } from '@payloadcms/plugin-search/types'

import { searchRowFields } from './searchRow'
import { isIndexedCollection } from './searchTargets'

export const beforeSyncWithSearch: BeforeSync = async ({ req, originalDoc, searchDoc }) => {
  const {
    doc: { relationTo: collection },
  } = searchDoc
  if (!isIndexedCollection(collection))
    throw new Error(`Collection is not searchable: ${collection}`)

  const source = originalDoc as Record<string, unknown>
  const row = searchRowFields(collection, source)
  const meta = (source.meta ?? {}) as { title?: string; description?: string; image?: unknown }

  const modifiedDoc: DocToSync = {
    doc: searchDoc.doc,
    ...row,
    meta: {
      title: meta.title || row.title,
      description: meta.description,
      ...(collection === 'posts' && meta.image
        ? {
            image: typeof meta.image === 'object' ? (meta.image as { id: unknown }).id : meta.image,
          }
        : {}),
    },
    categories: [],
  }

  const categories = collection === 'posts' ? source.categories : null
  if (Array.isArray(categories) && categories.length > 0) {
    const populatedCategories: { id: string | number; title: string }[] = []
    for (const category of categories) {
      if (!category) continue

      if (typeof category === 'object') {
        populatedCategories.push(category)
        continue
      }

      const doc = await req.payload.findByID({
        collection: 'categories',
        overrideAccess: false,
        id: category,
        disableErrors: true,
        depth: 0,
        select: { title: true },
        req,
      })

      if (doc !== null) {
        populatedCategories.push(doc)
      } else {
        console.error(
          `Failed. Category not found when syncing collection '${collection}' with id: '${source.id}' to search.`,
        )
      }
    }

    modifiedDoc.categories = populatedCategories.map((each) => ({
      relationTo: 'categories',
      categoryID: String(each.id),
      title: each.title,
    }))
  }

  return modifiedDoc
}
