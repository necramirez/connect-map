import type { APIRoute } from 'astro';
import { summarizeConnectDetails } from '../lib/connectDirectory';
import { readConnects } from '../lib/readConnects';

export const GET: APIRoute = async () => {
  const locations = await readConnects();
  return new Response(JSON.stringify(locations.map(summarizeConnectDetails)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
