import express, { NextFunction, Request, Response } from "express";
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
import responseTime from "response-time";

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 300, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
  standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
})

// Allowed origins for CORS
const allowedOrigins = ["http://localhost:3000", "http://localhost:3001","https://chatapp.ayushdixit.site", "https://chat-app-seven-rho-22.vercel.app"];

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDb(MONGO_URI); // Pass your MongoDB URI here

// Enable trust proxy
app.set('trust proxy', 1);

// Middlewares
app.use(helmet()); // Security headers
app.use(limiter)

// Logging based on environment (development/production)
const logFormat = NODE_ENV === "development" ? "dev" : "combined";
app.use(morgan(logFormat));

const register = new client.Registry();

// Add default metrics to the registry
client.collectDefaultMetrics({ register });

// Custom metric - Counter (Total Requests)
const requestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'endpoint'],
});
register.registerMetric(requestCounter);

// Custom metric - Histogram (Request Duration)
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'endpoint'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.3, 0.5, 1, 2, 5], // Fine-tuned buckets
});

register.registerMetric(httpRequestDurationMicroseconds);

const responseStatusCounter = new client.Counter({
  name: 'http_response_status_total',
  help: 'Count of HTTP responses by status code',
  labelNames: ['status'],
});
register.registerMetric(responseStatusCounter);

// Register Metrics Middleware First
app.use((req, res, next) => {
  if (req.path !== '/metrics') {
    requestCounter.inc({ method: req.method, endpoint: req.url });
  }
  next();
});

app.use(responseTime((req: Request, res, time) => {
  if (req.path !== '/metrics') {
    httpRequestDurationMicroseconds.observe(
      { method: req.method, endpoint: req.url },
      time / 1000
    );
  }
}));


app.use((req: Request, res: Response, next: NextFunction) => {
  const updateResponseMetric = () => {
    if (req.path !== '/metrics') {
      const statusCode = Math.floor(res.statusCode / 100) * 100;
      responseStatusCounter.inc({ status: statusCode.toString() });
    }
    res.removeListener('finish', updateResponseMetric);
  };

  res.on('finish', updateResponseMetric);
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
