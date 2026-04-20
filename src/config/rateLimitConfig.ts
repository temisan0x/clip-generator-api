import rateLimit from "express-rate-limit";

const isDev = process.env.NODE_ENV !== "production";

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 100 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, 
  message: {
    error: "Too many requests. You can generate up to 5 clips per hour.",
  },
});

export const statusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 200 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, 
  message: {
    error: "Too many status checks. Please slow down.",
  },
});