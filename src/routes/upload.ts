import { Router } from "express";

const uploadRouter = Router();

uploadRouter.post("/upload", (req, res) => {
  res.json({ message: "Upload route is alive" });
});

export default uploadRouter;