import express from "express";
import cors from "cors";
import { createFileRouter } from "./routes/fileRoutes";

const app = express();

app.set("trust proxy", 1); 

const allowedOrigins = [
  "https://clipaura.vercel.app", 
  "http://localhost:3001",
  "http://127.0.0.1:3001" // Add this if you use the IP address locally
];

app.use(cors({
  origin:allowedOrigins,
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
}));


app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb", parameterLimit: 100000 }));
app.use("/api", createFileRouter());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;