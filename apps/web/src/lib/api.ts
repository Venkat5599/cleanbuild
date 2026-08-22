/**
 * Typed client for the Worker.
 *
 * The router type is imported from the API package, so a change to a procedure
 * breaks this build rather than the running page.
 */

import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import type { Router } from '@ratchet/api/router';

const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787';

const link = new RPCLink({ url: `${baseUrl}/rpc` });

export const api: RouterClient<Router> = createORPCClient(link);

/** The demo runs a single creator. Multi-tenant selection is post-jam work. */
export const DEMO_CREATOR_ID = 1;
