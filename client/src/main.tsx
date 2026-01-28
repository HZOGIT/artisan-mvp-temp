import { ClerkProvider } from "@clerk/clerk-react";
import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { ModalProvider } from "./contexts/ModalContext";
import "./index.css";

// Debug: Log startup
console.log('🚀 main.tsx: App starting...');
console.log('🔑 VITE_CLERK_PUBLISHABLE_KEY:', import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? '✅ defined' : '❌ undefined');

// Inject analytics if environment variables are available
if (typeof window !== 'undefined') {
  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  const websiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
  console.log('📊 Analytics endpoint:', endpoint);
  console.log('📊 Analytics website ID:', websiteId);
  if (endpoint && websiteId) {
    console.log('📊 Loading analytics script...');
    const script = document.createElement('script');
    script.defer = true;
    script.src = endpoint + '/umami';
    script.setAttribute('data-website-id', websiteId);
    document.head.appendChild(script);
  } else {
    console.log('📊 Analytics disabled (missing endpoint or websiteId)');
  }
}

console.log('⚙️ Creating QueryClient...');
const queryClient = new QueryClient();
console.log('✅ QueryClient created');

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

console.log('⚙️ Creating tRPC client...');
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});
console.log('✅ tRPC client created');

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  console.error('❌ Missing Clerk publishable key');
  throw new Error("Missing Clerk publishable key");
}

console.log('✅ Clerk publishable key found');
console.log('🔐 Creating root element...');

const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error('❌ Root element not found!');
  throw new Error('Root element not found');
}

console.log('✅ Root element found');
console.log('🔐 Initializing ClerkProvider...');

createRoot(rootElement).render(
  <ClerkProvider publishableKey={clerkPublishableKey}>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ModalProvider>
          <App />
        </ModalProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </ClerkProvider>
);

console.log('✅ App rendered successfully');
