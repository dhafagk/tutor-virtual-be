import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  successResponse,
  errorResponse,
  HTTP_STATUS,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
} from "../utils/apiResponse.js";

export const register = asyncHandler(async (req, res) => {
  const { username, email, password, role = "student", studentData } = req.body;

  // Validate role
  if (!["student", "admin"].includes(role)) {
    return errorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid role");
  }

  // Check if user already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email }],
    },
  });

  if (existingUser) {
    const message =
      existingUser.username === username
        ? "Username already exists"
        : "Email already exists";
    return errorResponse(res, HTTP_STATUS.CONFLICT, message);
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user with transaction to ensure atomicity
  const result = await prisma.$transaction(async (tx) => {
    // Create user
    const user = await tx.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        role,
      },
    });

    // If registering as student, create student record
    if (role === "student" && studentData) {
      const { studentId, name, program, semester } = studentData;

      // Check if studentId already exists
      const existingStudent = await tx.student.findUnique({
        where: { studentId },
      });

      if (existingStudent) {
        throw new Error("Student ID already exists");
      }

      await tx.student.create({
        data: {
          studentId,
          userId: user.userId,
          name,
          program,
          semester,
        },
      });
    }

    return user;
  });

  // Generate JWT token
  const token = jwt.sign(
    { userId: result.userId, username: result.username, role: result.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  return successResponse(
    res,
    HTTP_STATUS.CREATED,
    `${role.charAt(0).toUpperCase() + role.slice(1)} registered successfully`,
    {
      token,
      user: {
        userId: result.userId,
        username: result.username,
        email: result.email,
        role: result.role,
      },
    }
  );
});

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  // Find user
  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user) {
    return errorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_MESSAGES.INVALID_CREDENTIALS
    );
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    return errorResponse(
      res,
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_MESSAGES.INVALID_CREDENTIALS
    );
  }

  // Update login status
  await prisma.user.update({
    where: { userId: user.userId },
    data: {
      loginStatus: true,
      loginDate: new Date(),
    },
  });

  // Fetch full user profile with related data
  const userProfile = await prisma.user.findUnique({
    where: { userId: user.userId },
    select: {
      userId: true,
      username: true,
      email: true,
      role: true,
      loginStatus: true,
      loginDate: true,
      createdAt: true,
      admin: {
        select: {
          adminId: true,
          role: true,
          permissions: true,
        },
      },
      student: {
        select: {
          studentId: true,
          name: true,
          program: true,
          semester: true,
          createdAt: true,
        },
      },
    },
  });

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.userId, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.LOGIN, {
    token,
    user: userProfile,
  });
});

export const logout = asyncHandler(async (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Update login status
      await prisma.user.update({
        where: { userId: decoded.userId },
        data: { loginStatus: false },
      });
    } catch (error) {
      // Token might be invalid, but we still return success
      console.error("Token verification error during logout:", error);
    }
  }

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.LOGOUT);
});

export const getProfile = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { userId: req.user.userId },
    select: {
      userId: true,
      username: true,
      email: true,
      role: true,
      loginStatus: true,
      loginDate: true,
      createdAt: true,
      admin: {
        select: {
          adminId: true,
          role: true,
          permissions: true,
        },
      },
      student: {
        select: {
          studentId: true,
          name: true,
          program: true,
          semester: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) {
    return errorResponse(res, HTTP_STATUS.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }

  return successResponse(res, HTTP_STATUS.OK, SUCCESS_MESSAGES.RETRIEVED, {
    user,
  });
});
