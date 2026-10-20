import { revalidatePath, revalidateTag } from 'next/cache'

export function revalidatePublicContent(
  collection: 'pages' | 'posts',
  ...slugs: (string | null | undefined)[]
): void {
  for (const slug of slugs) {
    if (slug) revalidateTag(`${collection}_${slug}`, { expire: 0 })
  }
  for (const tag of ['global_header', 'global_footer', 'redirects']) {
    revalidateTag(tag, { expire: 0 })
  }
  // Related entries and archive blocks can appear on any cached public page.
  revalidatePath('/', 'layout')
}
