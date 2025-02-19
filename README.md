# Express App Template (TypeScript & MongoDB)

## Overview
This is a starter template for building Express applications with TypeScript and MongoDB. The purpose of this template is to provide a solid foundation with commonly used best practices so you don’t have to set up the same configuration repeatedly. It includes features such as error handling, security enhancements (using Helmet), and performance improvements (using Compression).

---

## Features
- **TypeScript**: Full TypeScript support for type safety.
- **MongoDB**: Pre-configured MongoDB connection using Mongoose.
- **Error Handling**: Centralized error handling mechanism.
- **Helmet**: Adds security headers to your app.
- **Compression**: Compresses HTTP responses to improve performance.
- **Preconfigured Setup**: Ready-to-use structure with common best practices.

---

## Getting Started

### Prerequisites
- Node.js and npm installed on your machine.
- MongoDB database (locally or remotely) with connection string available.

### Installation
1. Clone this repository:
    ```bash
    git clone https://github.com/ayushdixit23/express-app
    cd express-app
    ```

2. Install the dependencies:
    ```bash
    npm install
    ```

3. Set up your environment variables:
    - Create a `.env` file at the root of the project.
    - Add your MongoDB connection string to the `.env` file as follows:
    ```env
    MONGO_URI=mongodb://localhost:27017/your-db-name
    PORT="your-port"
    ```

---

## Folder Structure
```bash
├── src/
│   ├── controllers/        # Controllers for handling routes
│   ├── middlewares/        # Custom middleware (error handling, etc.)
│   ├── models/             # MongoDB models (Mongoose schemas)
│   ├── routes/             # Express route definitions
│   ├── index.ts            # Entry point for the application
│   └── helpers/            # Some configuration
├── .env                    # Environment variables (e.g., MONGO_URI)
├── package.json            # Project dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── README.md               # Project documentation
```

## Usage

### Run the App in Development Mode
To run the app in development mode, use the following command:

```bash
npm run dev
```

### Run the App in Production Mode
To run the app in development mode, use the following command:

```bash
npm run build
npm start
```

## Error Handling

The app uses a global error handler middleware located in src/middlewares/errorHandler.ts. Errors are passed through this middleware, which handles them appropriately and sends a consistent response format to the client.

## Security with Helmet
The app uses Helmet for security by adding HTTP headers that protect the app from some common web vulnerabilities.

## Performance with Compression
Compression is enabled to reduce the size of the response body, improving the application's performance by serving compressed responses when possible.

## Scripts

- **`npm run dev`**: Starts the application in development mode with live reloading.
- **`npm run build`**: Transpiles TypeScript code to JavaScript.
- **`npm start`**: Starts the application in production mode after building it.
