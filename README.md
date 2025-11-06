# Books Management API with Redis Caching & Cron Jobs

A comprehensive Books Management API built with Node.js, Express, Redis caching, and cron jobs for bulk processing. Features user authentication, CRUD operations, and intelligent caching with automatic invalidation.

## Features

### 🔐 **User Authentication**
- JWT-based authentication
- Secure password hashing with bcrypt
- User signup and login
- Protected routes with middleware

### 📚 **Book Management**
- Full CRUD operations for books
- User-scoped data isolation
- Input validation and sanitization
- Rich book metadata support

### ⚡ **Redis Caching**
- Automatic caching of book lists per user
- Cache invalidation on data changes
- 5-minute TTL for cached data
- User-specific cache keys

### 🔄 **Bulk Processing**
- Asynchronous bulk book insertion
- Redis-based job queue
- Cron job processing every 2 minutes
- Queue status monitoring

### 🛡️ **Security & Performance**
- Rate limiting
- Helmet security headers
- Input validation and sanitization
- Error handling and logging

## Dependencies

### Production Dependencies
- **express** (^4.18.2) - Web framework
- **ioredis** (^5.3.2) - Redis client
- **bcrypt** (^5.1.1) - Password hashing
- **jsonwebtoken** (^9.0.2) - JWT authentication
- **node-cron** (^3.0.2) - Cron job scheduling
- **express-validator** (^7.0.1) - Input validation
- **express-rate-limit** (^7.1.5) - Rate limiting
- **helmet** (^7.1.0) - Security headers
- **uuid** (^9.0.1) - Unique ID generation
- **cors** (^2.8.5) - Cross-origin support
- **dotenv** (^16.3.1) - Environment variables

### Development Dependencies
- **nodemon** (^3.0.1) - Auto-restart server
- **axios** (^1.6.0) - HTTP client for testing

## Prerequisites

1. **Node.js** (version 14 or higher)
2. **Redis server** running on localhost:6379

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment (edit `.env` if needed):
   ```bash
   PORT=3001
   JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

3. Start Redis server:
   ```bash
   # macOS with Homebrew:
   brew services start redis
   
   # Or manually:
   redis-server
   ```

4. Start the application:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication Routes

#### POST `/auth/signup`
Register a new user
```json
{
  "username": "johndoe",
  "email": "john@example.com", 
  "password": "securepass123"
}
```

#### POST `/auth/login`
Authenticate user and get JWT token
```json
{
  "email": "john@example.com",
  "password": "securepass123"
}
```

#### GET `/auth/me`
Get current user information (requires authentication)

### Book Management Routes (All require authentication)

#### GET `/books`
List all books for authenticated user
- **Caching**: Results cached in Redis (5-minute TTL)
- **Cache Key**: `books:user:{userId}`
- Returns cache source indicator

#### POST `/books`
Add a new book
```json
{
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "isbn": "978-0-7432-7356-5",
  "publishedYear": 1925,
  "genre": "Fiction"
}
```
- **Cache**: Invalidates user's books cache

#### PUT `/books/:id`
Update an existing book
- **Cache**: Invalidates user's books cache
- Only owner can update their books

#### DELETE `/books/:id`
Delete a book
- **Cache**: Invalidates user's books cache
- Only owner can delete their books

### Bulk Processing Routes

#### POST `/books/bulk`
Queue books for bulk insertion
```json
{
  "books": [
    {
      "title": "Book 1",
      "author": "Author 1",
      "genre": "Fiction"
    },
    {
      "title": "Book 2", 
      "author": "Author 2",
      "genre": "Non-Fiction"
    }
  ]
}
```
- **Queue**: Stored in Redis under `bulk_books:user:{userId}`
- **Processing**: Processed by cron job every 2 minutes
- **Limit**: Maximum 100 books per request

#### GET `/books/queue`
Check bulk processing queue status
- Shows queued books count and timing

### Utility Routes

#### GET `/health`
Health check endpoint

## Redis Key Patterns

The application uses structured Redis keys for data isolation:

- **User Books Cache**: `books:user:{userId}`
- **Bulk Processing Queue**: `bulk_books:user:{userId}`
- **User Sessions**: `session:user:{userId}` (if needed)

## Caching Strategy

### Cache Behavior
1. **GET /books** - Cache HIT returns data from Redis
2. **POST/PUT/DELETE** - Cache invalidation triggers fresh data fetch
3. **TTL**: 5 minutes for cached book lists
4. **User Isolation**: Each user has separate cache keys

### Cache Invalidation
Cache is automatically invalidated when:
- New book is added (POST)
- Existing book is updated (PUT) 
- Book is deleted (DELETE)
- Bulk books are processed (Cron job)

## Bulk Processing with Cron Jobs

### How It Works
1. **Queue**: POST `/books/bulk` stores books in Redis queue
2. **Scheduling**: Cron job runs every 2 minutes
3. **Processing**: Reads all user queues, processes books
4. **Cleanup**: Removes processed queues from Redis
5. **Cache**: Invalidates affected users' caches

### Cron Job Details
- **Schedule**: `*/2 * * * *` (every 2 minutes)
- **Pattern**: Processes all `bulk_books:user:*` keys
- **Error Handling**: Failed jobs remain queued for retry
- **Logging**: Detailed console output for monitoring

### Queue Management
- **Expiration**: Queued jobs expire after 1 hour
- **Status**: Check queue status via GET `/books/queue`
- **Limits**: Maximum 100 books per bulk request

## Testing

### Automated Testing
Run the complete flow test:
```bash
node test-complete-flow.js
```

This test covers:
- User signup and login
- Individual book CRUD operations
- Cache hits and misses
- Bulk book submission and processing
- Queue monitoring
- Cache invalidation

### Manual Testing

1. **Authentication**:
   ```bash
   # Signup
   curl -X POST http://localhost:3001/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","email":"test@example.com","password":"testpass123"}'
   
   # Login  
   curl -X POST http://localhost:3001/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"testpass123"}'
   ```

2. **Book Operations** (use token from login):
   ```bash
   # Get books (cache miss)
   curl -X GET http://localhost:3001/books \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   
   # Add book
   curl -X POST http://localhost:3001/books \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"title":"Test Book","author":"Test Author","genre":"Fiction"}'
   
   # Get books (cache miss after add)
   curl -X GET http://localhost:3001/books \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   
   # Get books again (cache hit)
   curl -X GET http://localhost:3001/books \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

3. **Bulk Processing**:
   ```bash
   # Submit bulk books
   curl -X POST http://localhost:3001/books/bulk \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"books":[{"title":"Book 1","author":"Author 1"},{"title":"Book 2","author":"Author 2"}]}'
   
   # Check queue status
   curl -X GET http://localhost:3001/books/queue \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   
   # Wait 2+ minutes, then check books again
   curl -X GET http://localhost:3001/books \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

## Architecture

### Data Flow
1. **Authentication**: JWT tokens for stateless auth
2. **Caching Layer**: Redis between API and data store
3. **Queue System**: Redis-based job queue for bulk ops
4. **Background Processing**: Cron jobs for async operations

### User Data Isolation
- All Redis keys include user ID
- Database queries filtered by user
- JWT tokens contain user identification
- No cross-user data access possible

### Error Handling
- Comprehensive validation on all inputs
- Graceful Redis connection handling
- Detailed error logging
- User-friendly error messages

## Security Features

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Helmet**: Security headers protection
- **JWT**: Stateless authentication
- **bcrypt**: Secure password hashing (12 rounds)
- **Input Sanitization**: XSS protection via express-validator
- **CORS**: Configurable cross-origin policy

## Performance Optimizations

- **Redis Caching**: Reduces database load
- **Connection Pooling**: Efficient Redis connections
- **Bulk Processing**: Async handling of large operations
- **TTL Management**: Automatic cache expiration
- **Rate Limiting**: Prevents abuse

## Monitoring & Logging

The application provides detailed console logging:
- 🔐 Authentication events
- 📚 Book operations
- 🎯 Cache hits/misses
- 📦 Bulk processing status
- 🤖 Cron job execution
- ❌ Error conditions

## Assignment Requirements Fulfillment

✅ **All Requirements Met:**

1. **✅ User Authentication**
   - JWT-based authentication ✓
   - Signup and login routes ✓
   - Secure password handling ✓

2. **✅ Book CRUD Operations** 
   - GET /books with user isolation ✓
   - POST /books for adding ✓
   - PUT /books/:id for updating ✓
   - DELETE /books/:id for deleting ✓

3. **✅ Redis Caching**
   - User-scoped caching ✓
   - Cache invalidation on changes ✓
   - Efficient Redis key management ✓

4. **✅ Bulk Processing + Cron Jobs**
   - POST /books/bulk for queueing ✓
   - Redis-based job storage ✓
   - Cron job every 2 minutes ✓
   - Graceful error handling ✓

5. **✅ Additional Features**
   - User data isolation ✓
   - Comprehensive error handling ✓
   - Security best practices ✓
   - Detailed documentation ✓
