# Books Management API with Redis Caching, Cron Jobs & Email Reporting

A comprehensive Books Management API built with Node.js, Express, Redis caching, cron jobs for bulk processing, PDF report generation, and email notifications. This extends the previous implementation with advanced reporting and multi-user concurrent processing capabilities.

## 🆕 New Features in Q3

### 📊 **Bulk Processing Status Tracking**
- Track success/failure counts for bulk insertions
- Store processing status per user in Redis
- Support for concurrent multi-user processing

### 📄 **PDF Report Generation**
- Automated PDF reports with processing summaries
- Professional layout with company branding
- Detailed success/failure breakdowns
- Processing timeline information

### 📧 **Email Notifications**
- Automated email reports with PDF attachments
- HTML email templates with styling
- User-specific email delivery
- Configurable SMTP settings

### 🔄 **Dual Cron Job System**
1. **Bulk Processing Job** (every 2 minutes)
2. **Report Generation Job** (every 5 minutes)

### 👥 **Enhanced Multi-User Support**
- Concurrent bulk processing for multiple users
- User-scoped Redis keys and data isolation
- Independent report generation per user

## Dependencies

### Production Dependencies
- **express** (^4.18.2) - Web framework
- **ioredis** (^5.3.2) - Redis client
- **bcrypt** (^5.1.1) - Password hashing
- **jsonwebtoken** (^9.0.2) - JWT authentication
- **node-cron** (^3.0.2) - Cron job scheduling
- **nodemailer** (^6.9.7) - Email sending
- **pdfkit** (^0.13.0) - PDF generation
- **moment** (^2.29.4) - Date/time formatting
- **fs-extra** (^11.1.1) - Enhanced file system operations
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
3. **Email Account** with SMTP access (Gmail recommended)

## Installation & Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Edit the `.env` file with your settings:

```bash
# Server Configuration
PORT=3002
NODE_ENV=development

# Redis Configuration (using DB 2 to avoid conflicts)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=2

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production_q3
JWT_EXPIRES_IN=24h

# Cron Job Configuration
BULK_PROCESSING_INTERVAL=2      # Minutes
REPORT_GENERATION_INTERVAL=5    # Minutes

# Email Configuration (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password     # Use App Password for Gmail
FROM_EMAIL=your_email@gmail.com
FROM_NAME=Books Management System

# PDF Configuration
PDF_OUTPUT_DIR=./reports
PDF_CLEANUP_AFTER_SEND=true

# Company Branding
COMPANY_NAME=Books Management Inc.
COMPANY_ADDRESS=123 Library Street, Book City, BC 12345
```

### 3. Email Setup (Gmail)
1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security > 2-Step Verification > App passwords
   - Generate password for "Mail"
   - Use this password in `SMTP_PASS`

### 4. Start Redis Server
```bash
# macOS with Homebrew:
brew services start redis

# Or manually:
redis-server
```

### 5. Start the Application
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

#### PUT `/books/:id`
Update an existing book

#### DELETE `/books/:id`
Delete a book

### Bulk Processing Routes

#### POST `/books/bulk`
Queue books for bulk insertion with reporting
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

**Response:**
```json
{
  "success": true,
  "message": "Books queued for bulk processing. You will receive an email report within 7 minutes.",
  "data": {
    "requestId": "uuid-here",
    "queuedBooks": 2,
    "estimatedProcessingTime": "2 minutes",
    "estimatedReportTime": "7 minutes"
  }
}
```

#### GET `/books/queue`
Enhanced queue status with processing stages
- **Stages**: `queued` → `processed_awaiting_report` → `completed`

### Administrative Routes

#### GET `/admin/stats`
System statistics for monitoring
```json
{
  "data": {
    "totalUsers": 3,
    "totalBooks": 15,
    "pendingBulkJobs": 1,
    "pendingReports": 2
  }
}
```

#### GET `/health`
Health check with enhanced status

## Redis Key Architecture

The application uses structured Redis keys for multi-user data isolation:

### Key Patterns
- **User Books Cache**: `books:user:{userId}`
- **Bulk Processing Queue**: `bulk_books:user:{userId}`
- **Processing Status**: `bulk_status:user:{userId}`
- **User Sessions**: `session:user:{userId}` (reserved)

### Data Flow
1. **Bulk Submission** → `bulk_books:user:{userId}` (TTL: 2 hours)
2. **Processing Complete** → `bulk_status:user:{userId}` (TTL: 1 hour)
3. **Report Sent** → Status deleted to prevent duplicates

## Cron Job System

### Job 1: Bulk Book Processing (Every 2 Minutes)
```javascript
// Processes queued books and creates status records
const processBulkBooks = async () => {
  // 1. Get all bulk_books:user:* keys
  // 2. Process each user's books
  // 3. Track success/failure counts
  // 4. Store status in bulk_status:user:{userId}
  // 5. Clean up processed queue
};
```

### Job 2: Report Generation (Every 5 Minutes)
```javascript
// Generates and emails PDF reports
const generateAndSendReports = async () => {
  // 1. Get all bulk_status:user:* keys
  // 2. Generate PDF report for each user
  // 3. Send email with PDF attachment
  // 4. Clean up status record
};
```

### Error Handling
- **Processing Failures**: Failed jobs remain queued for retry
- **Email Failures**: Status records persist for retry
- **PDF Generation Errors**: Detailed logging for debugging
- **Concurrent Safety**: Redis atomic operations prevent conflicts

## PDF Report Structure

### Report Sections
1. **Header**: Company branding and contact info
2. **Report Details**: User info, timestamps, request ID
3. **Processing Summary**: Success/failure counts and rates
4. **Timeline**: Queue time, processing time, duration
5. **Failed Books**: Detailed error information (if any)
6. **Footer**: Generation timestamp and system info

### Sample Report Content
```
📄 Bulk Book Processing Report

Report ID: abc-123-def
User: alice_reader
Email: alice@example.com
Generated: October 13th 2025, 3:45:23 pm

Processing Summary:
Total Books Submitted: 5
Successfully Processed: 4 ✓
Failed to Process: 1 ✗
Success Rate: 80.0%

Processing Timeline:
Queued At: October 13th 2025, 3:40:15 pm
Processed At: October 13th 2025, 3:42:30 pm
Processing Duration: 2 minutes

Failed Books Details:
1. "Corrupted Book" by Unknown Author
   Error: Simulated database error
```

## Email Notification System

### Email Features
- **HTML Templates**: Professional styling with CSS
- **PDF Attachments**: Complete processing reports
- **Success Indicators**: Color-coded summary information
- **Responsive Design**: Works on desktop and mobile
- **Branded Content**: Company logo and contact information

### Email Configuration Options
- **SMTP Providers**: Gmail, Outlook, SendGrid, etc.
- **Security**: TLS/SSL support
- **Authentication**: OAuth2 or App Password support
- **Delivery Tracking**: Message ID logging

## Multi-User Concurrent Processing

### Isolation Mechanisms
1. **Redis Key Namespacing**: All keys include user ID
2. **Database Filtering**: Queries scoped by user
3. **Token-Based Auth**: JWT contains user identification
4. **Separate Email Delivery**: Individual reports per user

### Concurrent Safety
- **Atomic Operations**: Redis transactions prevent race conditions
- **Independent Processing**: Each user's data processed separately
- **Fault Isolation**: One user's failure doesn't affect others
- **Resource Management**: Configurable processing limits

### Performance Optimizations
- **Bulk Operations**: Efficient batch processing
- **Caching Strategy**: Smart cache invalidation
- **Background Jobs**: Non-blocking cron processing
- **Connection Pooling**: Optimized Redis connections

## Testing

### Automated Testing

#### Full Multi-User Test
```bash
node test-multiuser-concurrent.js
```

This comprehensive test:
- Creates 3 concurrent users
- Submits different bulk book collections
- Monitors processing status in real-time
- Verifies data isolation between users
- Confirms email report delivery

#### Quick Single User Test
```bash
node test-multiuser-concurrent.js quick
```

### Manual Testing Scenarios

#### Scenario 1: Basic Flow
```bash
# 1. Register user
curl -X POST http://localhost:3002/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"test123"}'

# 2. Submit bulk books (use token from signup)
curl -X POST http://localhost:3002/books/bulk \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"books":[{"title":"Test Book","author":"Test Author"}]}'

# 3. Monitor status
curl -X GET http://localhost:3002/books/queue \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Check admin stats
curl -X GET http://localhost:3002/admin/stats
```

#### Scenario 2: Multi-User Isolation
1. Create multiple users with different emails
2. Submit bulk books simultaneously
3. Verify each user receives only their report
4. Confirm no data cross-contamination

#### Scenario 3: Error Handling
- Submit invalid book data
- Test with invalid email addresses
- Simulate Redis failures
- Test cron job error recovery

### Expected Timeline
1. **Bulk Submission**: Immediate (202 response)
2. **Processing Start**: Within 2 minutes (next cron cycle)
3. **Processing Complete**: 1-2 minutes processing time
4. **Report Generation**: Within 5 minutes (next cron cycle)
5. **Email Delivery**: 1-2 minutes after generation
6. **Total Time**: 5-10 minutes end-to-end

## Monitoring & Logging

### Log Categories
- 🔐 **Authentication**: User login/registration events
- 📚 **Book Operations**: CRUD operations with caching info
- 📦 **Bulk Processing**: Queue management and processing status
- 📄 **Report Generation**: PDF creation and email sending
- 🤖 **Cron Jobs**: Scheduled task execution
- ❌ **Errors**: Detailed error information with context

### Monitoring Endpoints
- `/health` - System health and configuration
- `/admin/stats` - Real-time system statistics
- Redis CLI - Direct queue inspection

### Key Metrics to Monitor
- Bulk job queue length
- Report generation success rate
- Email delivery success rate
- Processing time per user
- Cache hit/miss ratios
- User registration rate

## Security Features

### Enhanced Security
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: Comprehensive validation on all inputs
- **Output Sanitization**: XSS protection via express-validator
- **Helmet Security**: Security headers protection
- **JWT Security**: Stateless authentication with expiration
- **Password Security**: bcrypt hashing (12 rounds)
- **Email Security**: TLS encryption for SMTP
- **File Security**: Automatic PDF cleanup after sending

### CORS & Cross-Origin
- Configurable CORS policy
- Support for frontend integration
- Secure credential handling

## Troubleshooting

### Common Issues

#### Email Not Sending
```bash
# Check email configuration
curl http://localhost:3002/health

# Verify SMTP settings in .env
# Test with Gmail App Password
# Check firewall settings
```

#### PDF Generation Fails
```bash
# Check reports directory permissions
ls -la ./reports/

# Verify disk space
df -h

# Check logs for PDF errors
```

#### Redis Connection Issues
```bash
# Test Redis connection
redis-cli ping

# Check Redis database
redis-cli SELECT 2
redis-cli KEYS *
```

#### Cron Jobs Not Running
```bash
# Check environment variables
# Verify BULK_PROCESSING_ENABLED=true
# Verify REPORT_GENERATION_ENABLED=true
# Monitor server logs for cron execution
```

### Performance Tuning
- Adjust cron intervals based on load
- Optimize Redis TTL values
- Configure email sending limits
- Monitor memory usage for PDF generation

## Assignment Requirements Fulfillment

✅ **All L2 Requirements Met:**

### 1. ✅ **Bulk Insertion Status Tracking**
- Status records stored per user in Redis ✓
- Success/failure counts tracked ✓
- User ID and timestamps included ✓
- Multi-user concurrent support ✓

### 2. ✅ **Report Generation & Email Cron Job**
- Second cron job runs every 5 minutes ✓
- Fetches all user status records ✓
- Generates professional PDF reports ✓
- Sends emails with PDF attachments ✓
- Deletes status after successful sending ✓

### 3. ✅ **Multiuser Support**
- Concurrent user processing ✓
- User-scoped Redis keys ✓
- Data isolation between users ✓
- Fault-tolerant cron jobs ✓

### 4. ✅ **Technical Implementation**
- Nodemailer for email sending ✓
- PDFKit for PDF generation ✓
- Consistent status updates ✓
- Proper error handling ✓
- Security and efficiency ✓

### 5. ✅ **Deliverables**
- Updated API with status tracking ✓
- Two cron jobs (bulk + reporting) ✓
- Sample PDF report structure ✓
- Multi-user testing instructions ✓
- Comprehensive logging ✓

## Extended Learning Outcomes

This implementation demonstrates:
- **Advanced Redis Patterns**: Multi-key operations, TTL management, atomic updates
- **PDF Generation**: Dynamic report creation with professional layouts
- **Email Integration**: SMTP configuration, HTML templates, attachments
- **Cron Job Architecture**: Multiple job coordination, error handling, state management
- **Multi-User Systems**: Data isolation, concurrent processing, resource management
- **Error Recovery**: Retry mechanisms, failure isolation, graceful degradation

The system is production-ready and demonstrates enterprise-level patterns for asynchronous processing, reporting, and user communication.
