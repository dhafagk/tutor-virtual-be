import { body, param, query, validationResult } from "express-validator";

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Validation error",
      errors: errors.array(),
    });
  }
  next();
};

// Auth validations
export const validateRegistration = [
  body("username")
    .isLength({ min: 3, max: 50 })
    .trim()
    .escape()
    .withMessage("Username must be 3-50 characters"),
  body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("role")
    .optional()
    .isIn(["student", "admin"])
    .withMessage("Role must be either 'student' or 'admin'"),
  body("studentData.studentId")
    .if(body("role").equals("student"))
    .notEmpty()
    .isLength({ min: 5, max: 20 })
    .withMessage(
      "Student ID required for student registration (5-20 characters)"
    ),
  body("studentData.name")
    .if(body("role").equals("student"))
    .notEmpty()
    .isLength({ min: 2, max: 100 })
    .withMessage("Student name required (2-100 characters)"),
  body("studentData.program")
    .if(body("role").equals("student"))
    .notEmpty()
    .isLength({ min: 2, max: 50 })
    .withMessage("Student program required (2-50 characters)"),
  body("studentData.semester")
    .if(body("role").equals("student"))
    .isInt({ min: 1, max: 14 })
    .withMessage("Semester must be between 1-14"),
  handleValidationErrors,
];

export const validateLogin = [
  body("username").notEmpty().trim().escape().withMessage("Username required"),
  body("password").notEmpty().withMessage("Password required"),
  handleValidationErrors,
];

// Chat validations
export const validateMessage = [
  body("message")
    .notEmpty()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Message required (max 1000 characters)"),
  body("sessionId")
    .optional()
    .isUUID()
    .withMessage("Invalid session ID format"),
  body("courseId").notEmpty().isUUID().withMessage("Valid course ID required"),
  handleValidationErrors,
];

// Admin validations
export const validateCourse = [
  body("courseCode")
    .notEmpty()
    .trim()
    .isLength({ min: 2, max: 20 })
    .withMessage("Course code required (2-20 characters)"),
  body("courseName")
    .notEmpty()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage("Course name required (3-100 characters)"),
  body("instructor")
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage("Insturctor required (3-100 characters)"),
  body("faculty")
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage("Faculty required (3-100 characters)"),
  body("credits")
    .isInt({ min: 1, max: 10 })
    .withMessage("SKS must be between 1-10"),
  handleValidationErrors,
];

export const validateContent = [
  body("courseId").notEmpty().isUUID().withMessage("Valid course ID required"),
  body("title")
    .notEmpty()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage("Title required (3-200 characters)"),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Description must be less than 1000 characters"),
  body("documentUrl")
    .optional()
    .isURL()
    .withMessage("Document URL must be valid"),
  handleValidationErrors,
];

export const validateStudent = [
  body("studentId")
    .notEmpty()
    .trim()
    .isLength({ min: 5, max: 20 })
    .withMessage("Student ID required (5-20 characters)"),
  body("name")
    .notEmpty()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name required (2-100 characters)"),
  body("program")
    .notEmpty()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Program required (2-50 characters)"),
  body("semester")
    .isInt({ min: 1, max: 14 })
    .withMessage("Semester must be between 1-14"),
  handleValidationErrors,
];

// Param validations
export const validateUUIDParam = (paramName) => [
  param(paramName).isUUID().withMessage(`Invalid ${paramName} format`),
  handleValidationErrors,
];

export const validateIntParam = (paramName) => [
  param(paramName).isInt({ min: 1 }).withMessage(`Invalid ${paramName} format`),
  handleValidationErrors,
];

// Query validations
export const validatePagination = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be >= 1"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be 1-100"),
  handleValidationErrors,
];

export const validateDateRange = [
  query("startDate").optional().isISO8601().withMessage("Invalid start date"),
  query("endDate").optional().isISO8601().withMessage("Invalid end date"),
  handleValidationErrors,
];

export const validateStartChat = [
  body("courseId").notEmpty().isUUID().withMessage("Valid course ID required"),
  handleValidationErrors,
];
