import rateLimit from "express-rate-limit";

// 5 uploads per hour per IP
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
   max: process.env.NODE_ENV === "production" ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. You can generate up to 5 clips per hour.",
  },
});

// 20 status checks per minute per IP
export const statusLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
   max: process.env.NODE_ENV === "production" ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many status checks. Please slow down.",
  },
});