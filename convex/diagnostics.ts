import { query } from "./_generated/server";

export const authStatus = query({
  args: {},
  handler: async (ctx) => {
    // Get deployment info
    const deployment = process.env.CONVEX_DEPLOYMENT || "unknown";
    const envLabel = process.env.NODE_ENV || "development";
    
    // Check if AUTH_SECRET is present
    const hasAuthSecret = !!process.env.AUTH_SECRET;
    
    // List enabled providers based on environment variables
    const providers = ["password"]; // Password is always enabled
    
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      providers.push("google");
    }
    
    if (process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET) {
      providers.push("microsoft");
    }
    
    return {
      deployment,
      hasAuthSecret,
      providers,
      envLabel,
      timestamp: Date.now(),
    };
  },
});
