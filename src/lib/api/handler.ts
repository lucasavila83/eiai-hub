import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, type ApiAuth } from "./middleware";
import { checkRateLimit, logApiRequest } from "./rate-limit";
import { withErrorHandler } from "./response";

type ApiHandler = (req: NextRequest, auth: ApiAuth) => Promise<NextResponse>;

/**
 * Wrap an API v1 route handler with:
 *  1. Authentication (Bearer or API Key)
 *  2. Rate limiting
 *  3. Request logging
 *  4. Error handling
 *
 * Usage:
 *   export const GET = apiHandler(async (req, auth) => {
 *     return apiSuccess({ hello: "world" });
 *   });
 */
export function apiHandler(handler: ApiHandler) {
  return async (req: NextRequest) => {
    return withErrorHandler(async () => {
      const startTime = Date.now();

      // 1. Authenticate
      const authResult = await authenticateRequest(req);
      if (authResult instanceof NextResponse) return authResult;
      const auth = authResult;

      // 2. Rate limit
      const endpoint = new URL(req.url).pathname;
      const rateLimitResult = checkRateLimit(auth, endpoint);
      if (rateLimitResult) return rateLimitResult;

      // 3. Execute handler
      const response = await handler(req, auth);

      // 4. Log (fire-and-forget)
      const responseTime = Date.now() - startTime;
      logApiRequest(auth, req.method, endpoint, response.status, responseTime, req);

      return response;
    });
  };
}
