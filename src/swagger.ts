// src/swagger.ts
import swaggerJsDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { type Express } from "express";

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "MS3 API Documentation",
      version: "1.0.0",
      description: "API documentation for the MS3 microservice. This microservice acts as an orchestrator for managing money transfers between accounts.",
    },
    servers: [{ url: `http://localhost:${process.env.PORT || 3000}` }],
  },
  apis: ["./src/index.ts"], // Apuntamos directamente al archivo de rutas
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

export const setupSwagger = (app: Express) => {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));
};