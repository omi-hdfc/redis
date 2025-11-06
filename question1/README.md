# Redis Caching Demo with Invalidation

This project demonstrates how to implement Redis caching with cache invalidation in a Node.js + Express application.

## Dependencies

### Production Dependencies:
- **express** (^4.18.2) - Web framework for Node.js
- **ioredis** (^5.3.2) - Modern Redis client for Node.js
- **cors** (^2.8.5) - Cross-Origin Resource Sharing middleware
- **dotenv** (^16.3.1) - Environment variable management

### Development Dependencies:
- **nodemon** (^3.0.1) - Auto-restart server during development

## Prerequisites

1. **Node.js** (version 14 or higher)
2. **Redis server** running on localhost:6379 (or configure in .env)

## Installation Steps

1. Install dependencies:
   ```bash
   npm install
   ```

2. Make sure Redis server is running:
   ```bash
   # On macOS with Homebrew:
   brew services start redis
   
   # Or start manually:
   redis-server
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## API Endpoints

- `GET /items` - Fetch all items (with caching)
- `POST /items` - Add a new item (invalidates cache)
- `PUT /items/:id` - Update an item by ID (invalidates cache)
- `DELETE /items/:id` - Delete an item by ID (invalidates cache)

## Features

- ✅ Redis caching with 1-minute TTL
- ✅ Cache invalidation on data modifications
- ✅ Console logs for cache hits/misses
- ✅ In-memory array as simulated database
- ✅ Proper error handling

## Testing the Cache

1. First `GET /items` → Cache miss, data fetched from DB
2. Second `GET /items` → Cache hit, data from Redis
3. `POST /items` → Adds item and invalidates cache
4. Next `GET /items` → Cache miss, fresh data fetched
