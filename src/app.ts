import express from "express";
import { createFileRouter } from "./routes/fileRoutes";
import path from "node:path";

const app = express();

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));
app.use("/api", createFileRouter());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;
