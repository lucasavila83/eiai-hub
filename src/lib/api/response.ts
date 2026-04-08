import { NextResponse } from "next/server";

// Standard API response format
export interface ApiResponse<T = any> {
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export enum ApiErrorCode {
  BAD_REQUEST = "BAD_REQUEST",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  RATE_LIMITED = "RATE_LIMITED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
}

/**
 * Success response with data
 */
export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data } satisfies ApiResponse<T>, { status });
}

/**
 * Success response with pagination
 */
export function apiPaginated<T>(data: T[], page: number, limit: number, total: number): NextResponse {
  return NextResponse.json({
    data,
    meta: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  } satisfies ApiResponse<T[]>, { status: 200 });
}

/**
 * Error response
 */
export function apiError(code: ApiErrorCode, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } } satisfies ApiErrorResponse, { status });
}

/**
 * Parse pagination params from URL search params
 */
export function parsePagination(searchParams: URLSearchParams): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Parse sort params from URL search params
 */
export function parseSort(searchParams: URLSearchParams, allowedFields: string[]): { sort: string; order: "asc" | "desc" } | null {
  const sort = searchParams.get("sort");
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";

  if (!sort || !allowedFields.includes(sort)) return null;
  return { sort, order };
}

/**
 * Wrap a handler with standard error catching
 */
export async function withErrorHandler(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (err: any) {
    console.error("[API v1 Error]", err);
    return apiError(ApiErrorCode.INTERNAL_ERROR, err?.message || "Internal server error", 500);
  }
}
