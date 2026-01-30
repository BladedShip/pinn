import {
  createRouter,
  RouterProvider as TanStackRouterProvider,
  type AnyRouter,
} from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

// Use global variable to persist router across HMR
declare global {
  interface Window {
    __pinn_router__?: AnyRouter;
  }
}

// Create a new router instance (singleton pattern to prevent duplicates during HMR)
function getRouter(): AnyRouter {
  // Check if router already exists in global scope
  if (typeof window !== 'undefined' && window.__pinn_router__) {
    return window.__pinn_router__;
  }

  // Create new router with auto-generated route tree
  const routerInstance = createRouter({ routeTree });

  // Store in global scope
  if (typeof window !== 'undefined') {
    window.__pinn_router__ = routerInstance;
  }

  return routerInstance;
}

// Export router instance
export const router = getRouter();

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Export RouterProvider component that uses our router
export function RouterProvider() {
  return <TanStackRouterProvider router={router} />;
}
