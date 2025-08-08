import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(403).json({ message: "Invalid token" });
    }
    return res.status(403).json({ message: "Token verification failed" });
  }
};

export const authorizeAdmin = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      include: { admin: true },
    });

    if (!user || user.role !== "admin" || !user.admin) {
      return res.status(403).json({ message: "Admin access required" });
    }

    req.admin = user.admin;
    req.userRole = "admin";
    next();
  } catch (error) {
    console.error("Admin authorization error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const authorizeStudent = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      include: { student: true },
    });

    if (!user || user.role !== "student" || !user.student) {
      return res.status(403).json({ message: "Student access required" });
    }

    req.student = user.student;
    req.userRole = "student";
    next();
  } catch (error) {
    console.error("Student authorization error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const authorizeStudentOrAdmin = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId },
      include: { admin: true, student: true },
    });

    if (!user) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (user.role === "admin" && user.admin) {
      req.admin = user.admin;
      req.userRole = "admin";
    } else if (user.role === "student" && user.student) {
      req.student = user.student;
      req.userRole = "student";
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  } catch (error) {
    console.error("Authorization error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
