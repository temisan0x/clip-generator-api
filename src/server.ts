import dotenv from "dotenv";
dotenv.config();

import app from "./app";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Clip Generator API running on port ${PORT}`);
});