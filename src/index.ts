// src/index.ts
import express, { type Express, type Request, type Response } from "express";

const app: Express = express();
const port = process.env.PORT || 3000;

app.get("/", (req: Request, res: Response) => {
  res.send("Hello from Express & TypeScript!");
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
