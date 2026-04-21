import express from "express";
import cors from "cors";
import { createFileRouter } from "./routes/fileRoutes";

const app = express();

app.set("trust proxy", 1); 

app.use(cors({
  origin: "https://clipaura.vercel.app",
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options('*', cors());

app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb", parameterLimit: 100000 }));
app.use("/api", createFileRouter());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;