import express from "express";
import { NODE_ENV, PORT, MONGO_URI } from "./utils/envConfig.js";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import connectDb from "./helpers/connectDb.js";
import compression from "compression";
import { errorMiddleware } from "./middlewares/errors/errorMiddleware.js";
import { CustomError } from "./middlewares/errors/CustomError.js";
import chatsRouter from "./routes/chats.js";
import friendRequestsRouter from "./routes/friend-request.js";
import groupRouter from "./routes/group.js";
import client from "prom-client";
import { rateLimit } from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
  standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
})

// Allowed origins for CORS
const allowedOrigins = ["http://localhost:3000", "http://192.168.1.2:3000", "http://localhost:3001"];

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDb(MONGO_URI); // Pass your MongoDB URI here

// Middlewares
app.use(helmet()); // Security headers
app.use(limiter)

// Logging based on environment (development/production)
const logFormat = NODE_ENV === "development" ? "dev" : "combined";
app.use(morgan(logFormat));


// Create a Registry which registers the metrics
const register = new client.Registry();

// Add default metrics to the registry
client.collectDefaultMetrics({ register });

// Custom metric - Counter
const requestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'endpoint']
});

// Increment the counter on each request
app.use((req, res, next) => {
  requestCounter.inc({ method: req.method, endpoint: req.url });
  next();
});

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json());

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"], // Allowed HTTP methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
    credentials: true, // Allow cookies to be sent
  })
);

// Routes
app.get("/", (_, res) => {
  res.send("Server is running!");
});

// Expose /metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get("/api/data", (_, res) => {
  // Send data from the server
  res.status(200).json({ message: "Data from the server" });
});

app.get("/api/error", (_, res) => {
  // throw your custom error like this
  throw new CustomError("This is a custom error", 400);
});

app.use("/api/chats", chatsRouter);
app.use("/api/chats", friendRequestsRouter);
app.use("/api/chats", groupRouter);

// 404 Handler for non-existent routes (must come after routes)
app.use((_, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Error Handling Middleware (must come after routes and 404 handler)
app.use(errorMiddleware);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
