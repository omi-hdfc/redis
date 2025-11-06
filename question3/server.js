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
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const moment = require('moment');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Initialize Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || '',
  db: process.env.REDIS_DB || 2,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
});

// Redis connection events
redis.on('connect', () => {
  console.log('✅ Connected to Redis (Books Management with Reporting)');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

// Email transporter setup
const createEmailTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Ensure reports directory exists
const ensureReportsDirectory = async () => {
  const reportsDir = process.env.PDF_OUTPUT_DIR || './reports';
  await fs.ensureDir(reportsDir);
  return reportsDir;
};

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
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
  bulkStatus: (userId) => `bulk_status:user:${userId}`,
  userSession: (userId) => `session:user:${userId}`,
  allBulkKeys: () => 'bulk_books:user:*',
  allStatusKeys: () => 'bulk_status:user:*'
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
      userEmail: req.user.email,
      books: books.map(book => ({
        ...book,
        id: generateId(),
        userId: req.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })),
      queuedAt: new Date().toISOString(),
      requestId: generateId()
    };
    
    // Store with 2-hour expiration
    await redis.setex(bulkKey, 7200, JSON.stringify(bulkData));
    
    console.log(`📋 Queued ${books.length} books for bulk processing (Request ID: ${bulkData.requestId})`);
    
    res.status(202).json({
      success: true,
      message: 'Books queued for bulk processing. You will receive an email report within 7 minutes.',
      data: {
        requestId: bulkData.requestId,
        queuedBooks: books.length,
        estimatedProcessingTime: '2 minutes',
        estimatedReportTime: '7 minutes',
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

// ENHANCED CRON JOB FOR BULK PROCESSING WITH STATUS TRACKING

const processBulkBooks = async () => {
  try {
    console.log('\n🤖 Cron Job: Processing bulk books with status tracking...');
    
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
        const { userId, username, userEmail, books, requestId } = bulkData;
        
        console.log(`📚 Processing ${books.length} books for user: ${username} (Request: ${requestId})`);
        
        let successCount = 0;
        let failCount = 0;
        const failedBooks = [];
        const processedAt = new Date().toISOString();
        
        // Process each book with error simulation
        for (const book of books) {
          try {
            // Simulate random failures (5% chance)
            if (Math.random() < 0.05) {
              throw new Error('Simulated database error');
            }
            
            // Insert book into database
            booksDatabase.push(book);
            successCount++;
          } catch (error) {
            failCount++;
            failedBooks.push({
              title: book.title,
              author: book.author,
              error: error.message
            });
            console.log(`❌ Failed to insert book "${book.title}": ${error.message}`);
          }
        }
        
        console.log(`✅ Bulk processing completed for ${username}: ${successCount} success, ${failCount} failed`);
        
        // Store processing status in Redis
        const statusKey = REDIS_KEYS.bulkStatus(userId);
        const statusData = {
          userId,
          username,
          userEmail,
          requestId,
          totalBooks: books.length,
          successCount,
          failCount,
          failedBooks,
          processedAt,
          queuedAt: bulkData.queuedAt,
          status: 'completed'
        };
        
        // Store status with 1-hour TTL (enough time for report generation)
        await redis.setex(statusKey, 3600, JSON.stringify(statusData));
        console.log(`📊 Status stored for ${username} - awaiting report generation`);
        
        // Invalidate user's books cache
        const cacheKey = REDIS_KEYS.userBooks(userId);
        await redis.del(cacheKey);
        
        // Remove processed bulk data from Redis
        await redis.del(key);
        
      } catch (error) {
        console.error(`❌ Error processing bulk books for key ${key}:`, error);
        // Don't delete the key if processing failed - it will be retried
      }
    }
    
  } catch (error) {
    console.error('❌ Error in bulk books processing:', error);
  }
};

// PDF GENERATION FUNCTION

const generateBulkReport = async (statusData) => {
  return new Promise((resolve, reject) => {
    try {
      const {
        username,
        userEmail,
        requestId,
        totalBooks,
        successCount,
        failCount,
        failedBooks,
        processedAt,
        queuedAt
      } = statusData;
      
      const reportsDir = process.env.PDF_OUTPUT_DIR || './reports';
      const filename = `bulk-report-${requestId}.pdf`;
      const filepath = path.join(reportsDir, filename);
      
      // Create PDF document
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);
      
      // Header
      doc.fontSize(20).text(process.env.COMPANY_NAME || 'Books Management System', { align: 'center' });
      doc.fontSize(12).text(process.env.COMPANY_ADDRESS || '', { align: 'center' });
      doc.moveDown(2);
      
      // Title
      doc.fontSize(18).text('Bulk Book Processing Report', { align: 'center', underline: true });
      doc.moveDown(2);
      
      // Report Details
      doc.fontSize(14).text('Report Details', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12);
      doc.text(`Report ID: ${requestId}`);
      doc.text(`User: ${username}`);
      doc.text(`Email: ${userEmail}`);
      doc.text(`Generated: ${moment(processedAt).format('MMMM Do YYYY, h:mm:ss a')}`);
      doc.moveDown(1);
      
      // Processing Summary
      doc.fontSize(14).text('Processing Summary', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12);
      doc.text(`Total Books Submitted: ${totalBooks}`);
      doc.text(`Successfully Processed: ${successCount}`, { fillColor: successCount > 0 ? 'green' : 'black' });
      doc.text(`Failed to Process: ${failCount}`, { fillColor: failCount > 0 ? 'red' : 'black' });
      doc.text(`Success Rate: ${((successCount / totalBooks) * 100).toFixed(1)}%`);
      doc.moveDown(1);
      
      // Timeline
      doc.fontSize(14).text('Processing Timeline', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12);
      doc.text(`Queued At: ${moment(queuedAt).format('MMMM Do YYYY, h:mm:ss a')}`);
      doc.text(`Processed At: ${moment(processedAt).format('MMMM Do YYYY, h:mm:ss a')}`);
      doc.text(`Processing Duration: ${moment(processedAt).diff(moment(queuedAt), 'minutes')} minutes`);
      doc.moveDown(1);
      
      // Failed Books Details (if any)
      if (failCount > 0 && failedBooks.length > 0) {
        doc.fontSize(14).text('Failed Books Details', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10);
        
        failedBooks.forEach((book, index) => {
          doc.text(`${index + 1}. "${book.title}" by ${book.author}`);
          doc.text(`   Error: ${book.error}`, { fillColor: 'red' });
          doc.moveDown(0.3);
        });
        doc.moveDown(1);
      }
      
      // Footer
      doc.fontSize(10).text('This is an automated report generated by Books Management System.', { align: 'center' });
      doc.text(`Report generated on ${moment().format('MMMM Do YYYY, h:mm:ss a')}`, { align: 'center' });
      
      // Finalize PDF
      doc.end();
      
      stream.on('finish', () => {
        console.log(`📄 PDF report generated: ${filepath}`);
        resolve({ filepath, filename });
      });
      
      stream.on('error', (error) => {
        console.error(`❌ PDF generation error:`, error);
        reject(error);
      });
      
    } catch (error) {
      reject(error);
    }
  });
};

// EMAIL SENDING FUNCTION

const sendReportEmail = async (userEmail, username, pdfPath, statusData) => {
  try {
    const transporter = createEmailTransporter();
    
    const { successCount, failCount, totalBooks, requestId } = statusData;
    
    const mailOptions = {
      from: {
        name: process.env.FROM_NAME || 'Books Management System',
        address: process.env.FROM_EMAIL
      },
      to: userEmail,
      subject: `📚 Bulk Books Processing Report - ${successCount}/${totalBooks} Successful`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">📚 Bulk Books Processing Complete</h2>
          
          <p>Hello <strong>${username}</strong>,</p>
          
          <p>Your bulk books processing request has been completed. Please find the detailed report attached.</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">📊 Quick Summary</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>Request ID:</strong> ${requestId}</li>
              <li><strong>Total Books:</strong> ${totalBooks}</li>
              <li style="color: green;"><strong>Successfully Processed:</strong> ${successCount}</li>
              ${failCount > 0 ? `<li style="color: red;"><strong>Failed:</strong> ${failCount}</li>` : ''}
              <li><strong>Success Rate:</strong> ${((successCount / totalBooks) * 100).toFixed(1)}%</li>
            </ul>
          </div>
          
          ${failCount > 0 ? 
            `<div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #856404;"><strong>⚠️ Note:</strong> Some books failed to process. Please check the attached report for details.</p>
            </div>` : 
            `<div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 10px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #155724;"><strong>✅ Success:</strong> All books were processed successfully!</p>
            </div>`
          }
          
          <p>The detailed PDF report is attached to this email with complete information about the processing results.</p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          
          <p style="font-size: 12px; color: #666;">
            This is an automated email from Books Management System.<br>
            Generated on ${moment().format('MMMM Do YYYY, h:mm:ss a')}
          </p>
        </div>
      `,
      attachments: [
        {
          filename: path.basename(pdfPath),
          path: pdfPath,
          contentType: 'application/pdf'
        }
      ]
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${userEmail}: ${info.messageId}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Email sending error for ${userEmail}:`, error);
    throw error;
  }
};

// REPORT GENERATION AND EMAIL CRON JOB

const generateAndSendReports = async () => {
  try {
    console.log('\n📊 Cron Job: Generating and sending reports...');
    
    // Get all status keys
    const statusKeys = await redis.keys(REDIS_KEYS.allStatusKeys());
    
    if (statusKeys.length === 0) {
      console.log('📭 No reports to generate');
      return;
    }
    
    console.log(`📋 Found ${statusKeys.length} report(s) to generate and send`);
    
    // Ensure reports directory exists
    const reportsDir = await ensureReportsDirectory();
    
    for (const key of statusKeys) {
      try {
        const statusDataStr = await redis.get(key);
        if (!statusDataStr) continue;
        
        const statusData = JSON.parse(statusDataStr);
        const { username, userEmail, requestId } = statusData;
        
        console.log(`📄 Generating report for ${username} (${requestId})`);
        
        // Generate PDF report
        const { filepath, filename } = await generateBulkReport(statusData);
        
        // Send email with PDF attachment
        await sendReportEmail(userEmail, username, filepath, statusData);
        
        // Clean up PDF file if configured
        if (process.env.PDF_CLEANUP_AFTER_SEND === 'true') {
          await fs.remove(filepath);
          console.log(`🗑️ PDF file cleaned up: ${filename}`);
        }
        
        // Remove status record to prevent duplicate reports
        await redis.del(key);
        console.log(`✅ Report sent and status cleaned for ${username}`);
        
      } catch (error) {
        console.error(`❌ Error generating/sending report for key ${key}:`, error);
        // Don't delete the status - will retry next time
      }
    }
    
  } catch (error) {
    console.error('❌ Error in report generation process:', error);
  }
};

// Schedule cron jobs
if (process.env.BULK_PROCESSING_ENABLED !== 'false') {
  const bulkInterval = `*/${process.env.BULK_PROCESSING_INTERVAL || 2} * * * *`;
  cron.schedule(bulkInterval, processBulkBooks);
  console.log(`⏰ Bulk processing cron job scheduled: every ${process.env.BULK_PROCESSING_INTERVAL || 2} minutes`);
}

if (process.env.REPORT_GENERATION_ENABLED !== 'false') {
  const reportInterval = `*/${process.env.REPORT_GENERATION_INTERVAL || 5} * * * *`;
  cron.schedule(reportInterval, generateAndSendReports);
  console.log(`📊 Report generation cron job scheduled: every ${process.env.REPORT_GENERATION_INTERVAL || 5} minutes`);
}

// UTILITY ROUTES

// GET /books/queue - Check bulk queue status
app.get('/books/queue', authenticateUser, async (req, res) => {
  try {
    const bulkKey = REDIS_KEYS.bulkBooks(req.user.id);
    const statusKey = REDIS_KEYS.bulkStatus(req.user.id);
    
    const queueData = await redis.get(bulkKey);
    const statusData = await redis.get(statusKey);
    
    if (!queueData && !statusData) {
      return res.json({
        success: true,
        data: {
          queued: false,
          processing: false,
          message: 'No books in queue or processing'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    let response = { success: true, timestamp: new Date().toISOString() };
    
    if (queueData) {
      const parsedQueue = JSON.parse(queueData);
      const queueTtl = await redis.ttl(bulkKey);
      
      response.data = {
        queued: true,
        processing: false,
        stage: 'queued',
        booksCount: parsedQueue.books.length,
        requestId: parsedQueue.requestId,
        queuedAt: parsedQueue.queuedAt,
        expiresIn: queueTtl > 0 ? queueTtl : 'Unknown'
      };
    } else if (statusData) {
      const parsedStatus = JSON.parse(statusData);
      const statusTtl = await redis.ttl(statusKey);
      
      response.data = {
        queued: false,
        processing: true,
        stage: 'processed_awaiting_report',
        requestId: parsedStatus.requestId,
        totalBooks: parsedStatus.totalBooks,
        successCount: parsedStatus.successCount,
        failCount: parsedStatus.failCount,
        processedAt: parsedStatus.processedAt,
        reportExpiresIn: statusTtl > 0 ? statusTtl : 'Unknown'
      };
    }
    
    res.json(response);
    
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
    message: 'Books Management API with Reporting is running',
    redis: redis.status,
    bulkProcessing: process.env.BULK_PROCESSING_ENABLED !== 'false',
    reportGeneration: process.env.REPORT_GENERATION_ENABLED !== 'false',
    emailConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
    timestamp: new Date().toISOString()
  });
});

// GET /admin/stats - Admin statistics (for testing)
app.get('/admin/stats', async (req, res) => {
  try {
    const bulkKeys = await redis.keys(REDIS_KEYS.allBulkKeys());
    const statusKeys = await redis.keys(REDIS_KEYS.allStatusKeys());
    
    res.json({
      success: true,
      data: {
        totalUsers: usersDatabase.length,
        totalBooks: booksDatabase.length,
        pendingBulkJobs: bulkKeys.length,
        pendingReports: statusKeys.length,
        bulkKeys: bulkKeys,
        statusKeys: statusKeys
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting admin stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
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

// Initialize and start server
const startServer = async () => {
  try {
    // Ensure reports directory exists
    await ensureReportsDirectory();
    console.log('📁 Reports directory initialized');
    
    // Start server
    app.listen(PORT, () => {
      console.log(`\n🚀 Books Management API with Reporting running on http://localhost:${PORT}`);
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
      console.log('   GET    /admin/stats     - Admin statistics');
      console.log('   GET    /health          - Health check');
      console.log(`\n🔐 JWT Authentication required for all /books routes`);
      console.log(`⏰ Bulk processing: every ${process.env.BULK_PROCESSING_INTERVAL || 2} minutes`);
      console.log(`📊 Report generation: every ${process.env.REPORT_GENERATION_INTERVAL || 5} minutes`);
      console.log(`📧 Email notifications: ${process.env.SMTP_USER ? 'Configured' : 'NOT CONFIGURED'}`);
      console.log('🧪 Ready to test Books Management with Redis caching and reporting!\n');
    });
    
  } catch (error) {
    console.error('❌ Server startup error:', error);
    process.exit(1);
  }
};

startServer();
