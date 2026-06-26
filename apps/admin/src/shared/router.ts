import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "../routes/__root";
import { indexRoute } from "../routes/index";
import { loginRoute } from "../routes/login";
import { artisansRoute } from "../routes/artisans";
import { subscriptionsRoute } from "../routes/subscriptions";
import { eventsRoute } from "../routes/events";
import { llmUsageRoute } from "../routes/llm-usage";

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, artisansRoute, subscriptionsRoute, eventsRoute, llmUsageRoute]);

export const adminRouter = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof adminRouter;
  }
}
