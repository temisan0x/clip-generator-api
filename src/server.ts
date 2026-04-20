import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import path from "path";
import dns from "node:dns";
import app from "./app";
import startWorker from "./queue/clipWorker";

dns.setDefaultResultOrder("ipv4first");

startWorker();

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Clip Generator API running on port ${PORT}`);
});

server.timeout = 300000;        
server.keepAliveTimeout = 310000;
server.headersTimeout = 320000;

console.log("GROQ KEY:", process.env.GROQ_API_KEY ? "loaded ✅" : "missing ❌");

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("✅ Uploads directory created");
}