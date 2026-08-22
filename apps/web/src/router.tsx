import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    // A dashboard that silently shows nothing on error is worse than one that
    // says what broke.
    defaultErrorComponent: ({ error }) => (
      <div className="state">
        <strong>This view could not load.</strong>
        <p className="dim">{error instanceof Error ? error.message : String(error)}</p>
        <p className="faint">
          The API may not be running. Start it with <code>bun run --cwd apps/api dev</code>.
        </p>
      </div>
    ),
    defaultNotFoundComponent: () => (
      <div className="state">
        <strong>No such view.</strong>
      </div>
    ),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
