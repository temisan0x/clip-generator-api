import express from "express";
import cors from "cors";
import { createFileRouter } from "./routes/fileRoutes";

const app = express();

app.use(cors({
  origin: "http://localhost:3001",
  methods: ["GET", "POST"],
}));

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));
app.use("/api", createFileRouter());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;
