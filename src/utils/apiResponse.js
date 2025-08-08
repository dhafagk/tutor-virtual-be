/**
 * Standardized API Response utility
 * Ensures consistent response structure across all endpoints
 */

/**
 * Success response structure:
 * {
 *   success: true,
 *   message: string,
 *   data: any,
 *   timestamp: string
 * }
 */
export const successResponse = (res, statusCode = 200, message = "Success", data = null) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

/**
 * Error response structure:
 * {
 *   success: false,
 *   message: string,
 *   error: {
 *     code: string|number,
 *     details: any
 *   },
 *   timestamp: string
 * }
 */
export const errorResponse = (res, statusCode = 500, message = "Internal server error", errorCode = null, details = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error: {
      code: errorCode || statusCode,
      details
    },
    timestamp: new Date().toISOString()
  });
};

/**
 * Validation error response structure:
 * {
 *   success: false,
 *   message: string,
 *   error: {
 *     code: "VALIDATION_ERROR",
 *     details: array of validation errors
 *   },
 *   timestamp: string
 * }
 */
export const validationErrorResponse = (res, errors, message = "Validation failed") => {
  return res.status(400).json({
    success: false,
    message,
    error: {
      code: "VALIDATION_ERROR",
      details: errors
    },
    timestamp: new Date().toISOString()
  });
};

/**
 * Paginated response structure:
 * {
 *   success: true,
 *   message: string,
 *   data: any,
 *   pagination: {
 *     page: number,
 *     limit: number,
 *     total: number,
 *     totalPages: number,
 *     hasNext: boolean,
 *     hasPrev: boolean
 *   },
 *   timestamp: string
 * }
 */
export const paginatedResponse = (res, data, pagination, message = "Data retrieved successfully") => {
  const { page, limit, total } = pagination;
  const totalPages = Math.ceil(total / limit);
  
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    timestamp: new Date().toISOString()
  });
};

// Common HTTP status codes and messages
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500
};

// Common success messages
export const SUCCESS_MESSAGES = {
  CREATED: "Resource created successfully",
  UPDATED: "Resource updated successfully",
  DELETED: "Resource deleted successfully",
  RETRIEVED: "Resource retrieved successfully",
  LOGIN: "Login successful",
  LOGOUT: "Logout successful",
  REGISTRATION: "Registration successful"
};

// Common error messages
export const ERROR_MESSAGES = {
  NOT_FOUND: "Resource not found",
  UNAUTHORIZED: "Unauthorized access",
  FORBIDDEN: "Access forbidden",
  VALIDATION_FAILED: "Validation failed",
  ALREADY_EXISTS: "Resource already exists",
  INTERNAL_ERROR: "Internal server error",
  INVALID_CREDENTIALS: "Invalid credentials",
  TOKEN_EXPIRED: "Token has expired",
  INVALID_TOKEN: "Invalid token"
};