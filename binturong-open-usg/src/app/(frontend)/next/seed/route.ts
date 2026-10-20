export async function POST(): Promise<Response> {
  return new Response('Action forbidden.', { status: 403 })
}
