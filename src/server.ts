import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import path from "path";
import dns from "node:dns";
import app from "./app";
import startWorker from "./queue/clipWorker";

// Prefer IPv4 first to avoid IPv6 route issues that can cause ETIMEDOUT in some environments.
dns.setDefaultResultOrder("ipv4first");

startWorker();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Clip Generator API running on port ${PORT}`);
});
console.log("GROQ KEY:", process.env.GROQ_API_KEY ? "loaded ✅" : "missing ❌");

const uploadsDir = path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("✅ Uploads directory created");
}