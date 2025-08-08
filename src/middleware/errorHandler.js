import { errorResponse, HTTP_STATUS, ERROR_MESSAGES } from "../utils/apiResponse.js";

export const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Prisma errors
  if (err.code === "P2002") {
    return errorResponse(
      res, 
      HTTP_STATUS.CONFLICT, 
      "Resource already exists", 
      "P2002",
      { field: err.meta?.target?.[0] || "unknown" }
    );
  }

  if (err.code === "P2025") {
    return errorResponse(
      res, 
      HTTP_STATUS.NOT_FOUND, 
      ERROR_MESSAGES.NOT_FOUND, 
      "P2025"
    );
  }

  // Validation errors
  if (err.name === "ValidationError") {
    return errorResponse(
      res, 
      HTTP_STATUS.BAD_REQUEST, 
      ERROR_MESSAGES.VALIDATION_FAILED, 
      "VALIDATION_ERROR",
      err.errors
    );
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return errorResponse(
      res, 
      HTTP_STATUS.UNAUTHORIZED, 
      ERROR_MESSAGES.INVALID_TOKEN, 
      "INVALID_TOKEN"
    );
  }

  if (err.name === "TokenExpiredError") {
    return errorResponse(
      res, 
      HTTP_STATUS.UNAUTHORIZED, 
      ERROR_MESSAGES.TOKEN_EXPIRED, 
      "TOKEN_EXPIRED"
    );
  }

  // OpenAI errors
  if (err.response?.status === 401) {
    return errorResponse(
      res, 
      HTTP_STATUS.INTERNAL_SERVER_ERROR, 
      "OpenAI API authentication failed", 
      "OPENAI_AUTH_ERROR"
    );
  }

  if (err.response?.status === 429) {
    return errorResponse(
      res, 
      HTTP_STATUS.TOO_MANY_REQUESTS, 
      "OpenAI API rate limit exceeded", 
      "OPENAI_RATE_LIMIT"
    );
  }

  // Default error
  return errorResponse(
    res, 
    err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR, 
    err.message || ERROR_MESSAGES.INTERNAL_ERROR, 
    "INTERNAL_ERROR",
    process.env.NODE_ENV === "development" ? { stack: err.stack } : null
  );
};

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};