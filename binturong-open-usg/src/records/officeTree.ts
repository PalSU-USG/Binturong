export type Branch = 'executive' | 'legislative' | 'judicial'
export type OfficeInput = {
  id: number
  name: string
  slug: string
  branch: Branch | null
  parent: number | null
}
export type OfficeNode = { id: number; name: string; slug: string; children: OfficeNode[] }
export type BranchGroup = { branch: Branch | null; label: string; roots: OfficeNode[] }

const GROUPS: { branch: Branch | null; label: string }[] = [
  { branch: 'executive', label: 'Executive' },
  { branch: 'legislative', label: 'Legislative' },
  { branch: 'judicial', label: 'Judicial' },
  { branch: null, label: 'Other offices' },
]
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

/**
 * Builds the chart from published offices only. A parent that is not in the input (unpublished or
 * missing) is skipped and its children move up, so no hidden title is exposed. A parent cycle is
 * broken instead of dropping its offices. Roots are grouped by their own branch.
 */
export function buildOfficeTree(offices: OfficeInput[]): BranchGroup[] {
  const nodes = new Map<number, OfficeNode>()
  for (const o of offices) nodes.set(o.id, { id: o.id, name: o.name, slug: o.slug, children: [] })
  const roots = new Set<number>()
  const attached = new Set<number>()
  for (const o of offices) {
    const parent = o.parent !== null && o.parent !== o.id ? nodes.get(o.parent) : undefined
    if (parent) {
      parent.children.push(nodes.get(o.id)!)
      attached.add(o.id)
    } else roots.add(o.id)
  }
  // Anything unreachable from a root sits in a cycle: promote its first member.
  const reached = new Set<number>()
  const walk = (node: OfficeNode) => {
    if (reached.has(node.id)) return
    reached.add(node.id)
    node.children.forEach(walk)
  }
  roots.forEach((id) => walk(nodes.get(id)!))
  for (const o of offices)
    if (!reached.has(o.id)) {
      const parent = o.parent === null ? undefined : nodes.get(o.parent)
      if (parent) parent.children = parent.children.filter((c) => c.id !== o.id)
      roots.add(o.id)
      walk(nodes.get(o.id)!)
    }
  const sortDeep = (list: OfficeNode[]) => {
    list.sort(byName)
    list.forEach((n) => sortDeep(n.children))
  }
  const branchOf = new Map(offices.map((o) => [o.id, o.branch]))
  return GROUPS.flatMap(({ branch, label }) => {
    const list = [...roots]
      .filter((id) => (branchOf.get(id) ?? null) === branch)
      .map((id) => nodes.get(id)!)
    sortDeep(list)
    return list.length ? [{ branch, label, roots: list }] : []
  })
}
