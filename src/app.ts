import express from "express";
import dotenv from "dotenv";
import { createFileRouter } from "./routes/fileRoutes";
import path from "node:path";

dotenv.config();

const app = express();
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

app.use(express.json());
app.use("/api", createFileRouter(UPLOADS_DIR));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;