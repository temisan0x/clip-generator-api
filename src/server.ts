import dotenv from "dotenv";
dotenv.config();

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
