import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Tutor Virtual API",
      version: "1.0.0",
      description:
        "API documentation for Virtual Tutor application - AI-powered educational chatbot with RAG (Retrieval-Augmented Generation)",
      contact: {
        name: "API Support",
        email: "support@tutorvirtual.com",
      },
    },
    servers: [
      {
        url:
          process.env.NODE_ENV === "production"
            ? "https://your-domain.com"
            : "http://localhost:3001",
        description:
          process.env.NODE_ENV === "production"
            ? "Production server"
            : "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter JWT token obtained from login endpoint",
        },
      },
      schemas: {
        User: {
          type: "object",
          required: ["username", "email", "password"],
          properties: {
            userId: {
              type: "string",
              format: "uuid",
              description: "Unique user identifier",
            },
            username: {
              type: "string",
              description: "Unique username",
              example: "student1",
            },
            email: {
              type: "string",
              format: "email",
              description: "User email address",
              example: "student@example.com",
            },
            role: {
              type: "string",
              enum: ["student", "admin"],
              description: "User role",
              example: "student",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        Student: {
          type: "object",
          required: ["studentId", "name", "program", "semester"],
          properties: {
            studentId: {
              type: "string",
              description: "Student ID",
              example: "STD001",
            },
            name: {
              type: "string",
              description: "Student name",
              example: "John Doe",
            },
            program: {
              type: "string",
              description: "Study program",
              example: "Computer Science",
            },
            semester: {
              type: "integer",
              description: "Current semester",
              example: 5,
            },
          },
        },
        Course: {
          type: "object",
          required: ["courseCode", "courseName", "credits"],
          properties: {
            courseId: {
              type: "string",
              format: "uuid",
              description: "Course unique identifier",
            },
            courseCode: {
              type: "string",
              description: "Course code",
              example: "CS101",
            },
            courseName: {
              type: "string",
              description: "Course name",
              example: "Introduction to Computer Science",
            },
            description: {
              type: "string",
              description: "Course description",
            },
            credits: {
              type: "integer",
              description: "Credit hours",
              example: 3,
            },
            instructor: {
              type: "string",
              description: "Course instructor name",
              example: "Dr. John Smith",
            },
            semester: {
              type: "integer",
              description: "Recommended semester",
              example: 5,
            },
            faculty: {
              type: "string",
              description: "Faculty name",
              example: "Faculty of Computer Science",
            },
            department: {
              type: "string",
              description: "Department name",
              example: "Computer Science Department",
            },
            isActive: {
              type: "boolean",
              description: "Course active status",
              default: true,
            },
          },
        },
        Content: {
          type: "object",
          required: ["title"],
          properties: {
            contentId: {
              type: "integer",
              description: "Content unique identifier",
            },
            title: {
              type: "string",
              description: "Content title",
              example: "Introduction to Variables",
            },
            description: {
              type: "string",
              description: "Content description",
            },
            documentUrl: {
              type: "string",
              format: "uri",
              description: "URL to document",
              example: "https://example.com/doc.pdf",
            },
            createdAt: {
              type: "string",
              format: "date-time",
            },
          },
        },
        ChatSession: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              format: "uuid",
              description: "Chat session identifier",
            },
            courseId: {
              type: "string",
              format: "uuid",
              description: "Course identifier",
            },
            startTime: {
              type: "string",
              format: "date-time",
              description: "Session start time",
            },
            title: {
              type: "string",
              description: "Auto-generated session title",
              example: "Python Variables and Data Types",
            },
            lastMessage: {
              type: "string",
              description: "Last message sent by student",
              example: "How do I declare variables in Python?",
            },
          },
        },
        Message: {
          type: "object",
          properties: {
            messageId: {
              type: "string",
              format: "uuid",
              description: "Message identifier",
            },
            content: {
              type: "string",
              description: "Message content",
            },
            isFromUser: {
              type: "boolean",
              description: "True if message from user, false if from AI",
            },
            timestamp: {
              type: "string",
              format: "date-time",
              description: "Message timestamp",
            },
          },
        },
        SuccessResponse: {
          type: "object",
          required: ["success", "message", "timestamp"],
          properties: {
            success: {
              type: "boolean",
              example: true,
              description: "Indicates successful operation",
            },
            message: {
              type: "string",
              description: "Success message",
              example: "Operation completed successfully",
            },
            data: {
              type: "object",
              description:
                "Response data (null for operations without return data)",
            },
            timestamp: {
              type: "string",
              format: "date-time",
              description: "Response timestamp",
              example: "2024-01-01T00:00:00.000Z",
            },
          },
        },
        ErrorResponse: {
          type: "object",
          required: ["success", "message", "error", "timestamp"],
          properties: {
            success: {
              type: "boolean",
              example: false,
              description: "Indicates failed operation",
            },
            message: {
              type: "string",
              description: "Error message",
              example: "An error occurred",
            },
            error: {
              type: "object",
              required: ["code"],
              properties: {
                code: {
                  oneOf: [{ type: "string" }, { type: "number" }],
                  description: "Error code",
                  example: "VALIDATION_ERROR",
                },
                details: {
                  type: "object",
                  description: "Additional error details",
                },
              },
            },
            timestamp: {
              type: "string",
              format: "date-time",
              description: "Response timestamp",
              example: "2024-01-01T00:00:00.000Z",
            },
          },
        },
        ValidationErrorResponse: {
          type: "object",
          allOf: [
            { $ref: "#/components/schemas/ErrorResponse" },
            {
              type: "object",
              properties: {
                error: {
                  type: "object",
                  properties: {
                    code: {
                      type: "string",
                      example: "VALIDATION_ERROR",
                    },
                    details: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          field: {
                            type: "string",
                            description: "Field name with validation error",
                          },
                          message: {
                            type: "string",
                            description: "Validation error message",
                          },
                        },
                      },
                      description: "Array of validation errors",
                    },
                  },
                },
              },
            },
          ],
        },
        PaginatedResponse: {
          type: "object",
          allOf: [
            { $ref: "#/components/schemas/SuccessResponse" },
            {
              type: "object",
              properties: {
                pagination: {
                  type: "object",
                  required: [
                    "page",
                    "limit",
                    "total",
                    "totalPages",
                    "hasNext",
                    "hasPrev",
                  ],
                  properties: {
                    page: {
                      type: "number",
                      description: "Current page number",
                      example: 1,
                    },
                    limit: {
                      type: "number",
                      description: "Items per page",
                      example: 10,
                    },
                    total: {
                      type: "number",
                      description: "Total number of items",
                      example: 100,
                    },
                    totalPages: {
                      type: "number",
                      description: "Total number of pages",
                      example: 10,
                    },
                    hasNext: {
                      type: "boolean",
                      description: "Whether there are more pages",
                      example: true,
                    },
                    hasPrev: {
                      type: "boolean",
                      description: "Whether there are previous pages",
                      example: false,
                    },
                  },
                },
              },
            },
          ],
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.js", "./src/index.js"], // Path to the API files
};

const specs = swaggerJsdoc(options);

export { swaggerUi, specs };
