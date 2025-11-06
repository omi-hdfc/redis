const express = require('express');
const Redis = require('ioredis');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || '',
  db: process.env.REDIS_DB || 1,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
});

// Redis connection events
redis.on('connect', () => {
  console.log('✅ Connected to Redis (Books Management)');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { success: false, error: 'Too many requests from this IP' }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));

// In-memory databases (simulating real databases)
let usersDatabase = [];
let booksDatabase = [];

// Redis key patterns
const REDIS_KEYS = {
  userBooks: (userId) => `books:user:${userId}`,
  bulkBooks: (userId) => `bulk_books:user:${userId}`,
  userSession: (userId) => `session:user:${userId}`,
  allBulkKeys: () => 'bulk_books:user:*'
};

// Helper functions
const generateId = () => uuidv4();

const hashPassword = async (password) => {
  return await bcrypt.hash(password, 12);
};

const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

const generateToken = (userId) => {
  return jwt.sign(
    { userId, timestamp: Date.now() },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = usersDatabase.find(u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token. User not found.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid token.'
    });
  }
};

// Validation middleware
const validateSignup = [
  body('username').isLength({ min: 3, max: 30 }).trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6, max: 100 })
];

const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
];

const validateBook = [
  body('title').isLength({ min: 1, max: 200 }).trim().escape(),
  body('author').isLength({ min: 1, max: 100 }).trim().escape(),
  body('isbn').optional().isLength({ max: 20 }).trim(),
  body('publishedYear').optional().isInt({ min: 1000, max: new Date().getFullYear() }),
  body('genre').optional().isLength({ max: 50 }).trim().escape()
];

// Error handling helper
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// AUTH ROUTES

// User Signup
app.post('/auth/signup', validateSignup, handleValidationErrors, async (req, res) => {
  try {
    console.log('\n👤 POST /auth/signup - User registration');
    
    const { username, email, password } = req.body;
    
    // Check if user exists
    const existingUser = usersDatabase.find(u => u.email === email || u.username === username);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email or username already exists'
      });
    }
    
    // Hash password and create user
    const hashedPassword = await hashPassword(password);
    const newUser = {
      id: generateId(),
      username,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };
    
    usersDatabase.push(newUser);
    console.log(`✅ User created: ${username} (${email})`);
    
    // Generate token
    const token = generateToken(newUser.id);
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        createdAt: newUser.createdAt
      },
      token,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// User Login
app.post('/auth/login', validateLogin, handleValidationErrors, async (req, res) => {
  try {
    console.log('\n🔐 POST /auth/login - User authentication');
    
    const { email, password } = req.body;
    
    // Find user
    const user = usersDatabase.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }
    
    // Verify password
    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }
    
    console.log(`✅ User authenticated: ${user.username}`);
    
    // Generate token
    const token = generateToken(user.id);
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// BOOK CRUD ROUTES

// GET /books - List all books for authenticated user (with caching)
app.get('/books', authenticateUser, async (req, res) => {
  try {
    console.log(`\n📚 GET /books - User: ${req.user.username}`);
    
    const cacheKey = REDIS_KEYS.userBooks(req.user.id);
    
    // Check cache first
    const cachedBooks = await redis.get(cacheKey);
    
    if (cachedBooks) {
      console.log('🎯 Cache HIT - Returning books from Redis');
      const parsedBooks = JSON.parse(cachedBooks);
      return res.json({
        success: true,
        source: 'cache',
        data: parsedBooks,
        count: parsedBooks.length,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('💾 Cache MISS - Fetching books from database');
    
    // Fetch user's books from "database"
    const userBooks = booksDatabase.filter(book => book.userId === req.user.id);
    
    // Cache the books with 5-minute TTL
    await redis.setex(cacheKey, 300, JSON.stringify(userBooks));
    console.log(`✅ Books cached for user: ${req.user.username}`);
    
    res.json({
      success: true,
      source: 'database',
      data: userBooks,
      count: userBooks.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in GET /books:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /books - Add a new book
app.post('/books', authenticateUser, validateBook, handleValidationErrors, async (req, res) => {
  try {
    console.log(`\n➕ POST /books - User: ${req.user.username}`);
    
    const { title, author, isbn, publishedYear, genre } = req.body;
    
    const newBook = {
      id: generateId(),
      userId: req.user.id,
      title: title.trim(),
      author: author.trim(),
      isbn: isbn?.trim() || null,
      publishedYear: publishedYear || null,
      genre: genre?.trim() || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Add to database
    booksDatabase.push(newBook);
    console.log(`📖 Book added: "${newBook.title}" by ${newBook.author}`);
    
    // Invalidate user's books cache
    const cacheKey = REDIS_KEYS.userBooks(req.user.id);
    await redis.del(cacheKey);
    console.log('🗑️ User books cache invalidated');
    
    res.status(201).json({
      success: true,
      message: 'Book added successfully',
      data: newBook,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in POST /books:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// PUT /books/:id - Update a book
app.put('/books/:id', authenticateUser, validateBook, handleValidationErrors, async (req, res) => {
  try {
    const bookId = req.params.id;
    console.log(`\n✏️ PUT /books/${bookId} - User: ${req.user.username}`);
    
    // Find book
    const bookIndex = booksDatabase.findIndex(
      book => book.id === bookId && book.userId === req.user.id
    );
    
    if (bookIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Book not found or access denied'
      });
    }
    
    const { title, author, isbn, publishedYear, genre } = req.body;
    
    // Update book
    const updatedBook = {
      ...booksDatabase[bookIndex],
      title: title.trim(),
      author: author.trim(),
      isbn: isbn?.trim() || null,
      publishedYear: publishedYear || null,
      genre: genre?.trim() || null,
      updatedAt: new Date().toISOString()
    };
    
    booksDatabase[bookIndex] = updatedBook;
    console.log(`📝 Book updated: "${updatedBook.title}"`);
    
    // Invalidate user's books cache
    const cacheKey = REDIS_KEYS.userBooks(req.user.id);
    await redis.del(cacheKey);
    console.log('🗑️ User books cache invalidated');
    
    res.json({
      success: true,
      message: 'Book updated successfully',
      data: updatedBook,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in PUT /books/:id:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// DELETE /books/:id - Delete a book
app.delete('/books/:id', authenticateUser, async (req, res) => {
  try {
    const bookId = req.params.id;
    console.log(`\n🗑️ DELETE /books/${bookId} - User: ${req.user.username}`);
    
    // Find book
    const bookIndex = booksDatabase.findIndex(
      book => book.id === bookId && book.userId === req.user.id
    );
    
    if (bookIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Book not found or access denied'
      });
    }
    
    // Remove book
    const deletedBook = booksDatabase.splice(bookIndex, 1)[0];
    console.log(`🗑️ Book deleted: "${deletedBook.title}"`);
    
    // Invalidate user's books cache
    const cacheKey = REDIS_KEYS.userBooks(req.user.id);
    await redis.del(cacheKey);
    console.log('🗑️ User books cache invalidated');
    
    res.json({
      success: true,
      message: 'Book deleted successfully',
      data: deletedBook,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in DELETE /books/:id:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// BULK BOOKS ROUTE

// POST /books/bulk - Queue books for bulk insertion
app.post('/books/bulk', authenticateUser, async (req, res) => {
  try {
    console.log(`\n📦 POST /books/bulk - User: ${req.user.username}`);
    
    const { books } = req.body;
    
    // Validation
    if (!Array.isArray(books) || books.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Books must be a non-empty array'
      });
    }
    
    if (books.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 books allowed per bulk request'
      });
    }
    
    // Validate each book
    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      if (!book.title || !book.author) {
        return res.status(400).json({
          success: false,
          error: `Book at index ${i} is missing required fields (title, author)`
        });
      }
    }
    
    // Store bulk books in Redis for processing
    const bulkKey = REDIS_KEYS.bulkBooks(req.user.id);
    const bulkData = {
      userId: req.user.id,
      username: req.user.username,
      books: books.map(book => ({
        ...book,
        id: generateId(),
        userId: req.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })),
      queuedAt: new Date().toISOString()
    };
    
    // Store with 1-hour expiration
    await redis.setex(bulkKey, 3600, JSON.stringify(bulkData));
    
    console.log(`📋 Queued ${books.length} books for bulk processing`);
    
    res.status(202).json({
      success: true,
      message: 'Books queued for bulk processing. They will be added within 2 minutes.',
      data: {
        queuedBooks: books.length,
        estimatedProcessingTime: '2 minutes',
        queuedAt: bulkData.queuedAt
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in POST /books/bulk:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// CRON JOB FOR BULK PROCESSING

const processBulkBooks = async () => {
  try {
    console.log('\n🤖 Cron Job: Processing bulk books...');
    
    // Get all bulk book keys
    const bulkKeys = await redis.keys(REDIS_KEYS.allBulkKeys());
    
    if (bulkKeys.length === 0) {
      console.log('📭 No bulk books to process');
      return;
    }
    
    console.log(`📋 Found ${bulkKeys.length} bulk book queue(s) to process`);
    
    for (const key of bulkKeys) {
      try {
        const bulkDataStr = await redis.get(key);
        if (!bulkDataStr) continue;
        
        const bulkData = JSON.parse(bulkDataStr);
        const { userId, username, books } = bulkData;
        
        console.log(`📚 Processing ${books.length} books for user: ${username}`);
        
        // Insert books into database
        booksDatabase.push(...books);
        
        // Invalidate user's books cache
        const cacheKey = REDIS_KEYS.userBooks(userId);
        await redis.del(cacheKey);
        
        // Remove processed bulk data from Redis
        await redis.del(key);
        
        console.log(`✅ Successfully processed ${books.length} books for ${username}`);
        
      } catch (error) {
        console.error(`❌ Error processing bulk books for key ${key}:`, error);
        // Don't delete the key if processing failed - it will be retried
      }
    }
    
  } catch (error) {
    console.error('❌ Error in bulk books processing:', error);
  }
};

// Schedule cron job (every 2 minutes)
if (process.env.BULK_PROCESSING_ENABLED !== 'false') {
  const cronInterval = `*/${process.env.BULK_PROCESSING_INTERVAL || 2} * * * *`;
  cron.schedule(cronInterval, processBulkBooks);
  console.log(`⏰ Bulk processing cron job scheduled: every ${process.env.BULK_PROCESSING_INTERVAL || 2} minutes`);
}

// UTILITY ROUTES

// GET /books/queue - Check bulk queue status
app.get('/books/queue', authenticateUser, async (req, res) => {
  try {
    const bulkKey = REDIS_KEYS.bulkBooks(req.user.id);
    const queueData = await redis.get(bulkKey);
    
    if (!queueData) {
      return res.json({
        success: true,
        data: {
          queued: false,
          message: 'No books in queue'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    const parsedData = JSON.parse(queueData);
    const ttl = await redis.ttl(bulkKey);
    
    res.json({
      success: true,
      data: {
        queued: true,
        booksCount: parsedData.books.length,
        queuedAt: parsedData.queuedAt,
        expiresIn: ttl > 0 ? ttl : 'Unknown'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error checking queue:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /auth/me - Get current user info
app.get('/auth/me', authenticateUser, (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      createdAt: req.user.createdAt
    },
    timestamp: new Date().toISOString()
  });
});

// GET /health - Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Books Management API is running',
    redis: redis.status,
    bulkProcessing: process.env.BULK_PROCESSING_ENABLED !== 'false',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await redis.quit();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Books Management API running on http://localhost:${PORT}`);
  console.log('📋 Available endpoints:');
  console.log('   POST   /auth/signup     - User registration');
  console.log('   POST   /auth/login      - User authentication');
  console.log('   GET    /auth/me         - Get current user');
  console.log('   GET    /books           - List user books (cached)');
  console.log('   POST   /books           - Add a book');
  console.log('   PUT    /books/:id       - Update a book');
  console.log('   DELETE /books/:id       - Delete a book');
  console.log('   POST   /books/bulk      - Queue books for bulk processing');
  console.log('   GET    /books/queue     - Check bulk queue status');
  console.log('   GET    /health          - Health check');
  console.log(`\n🔐 JWT Authentication required for all /books routes`);
  console.log(`⏰ Bulk processing: every ${process.env.BULK_PROCESSING_INTERVAL || 2} minutes`);
  console.log('🧪 Ready to test Books Management with Redis caching!\n');
});
