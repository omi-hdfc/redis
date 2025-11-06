const express = require('express');
const Redis = require('ioredis');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || '',
  db: process.env.REDIS_DB || 0,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
});

// Redis connection events
redis.on('connect', () => {
  console.log('✅ Connected to Redis');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

// Middleware
app.use(cors());
app.use(express.json());

// Simulated database (in-memory array)
let itemsDatabase = [
  { id: 1, name: 'Laptop', price: 999.99, category: 'Electronics' },
  { id: 2, name: 'Coffee Mug', price: 12.50, category: 'Kitchen' },
  { id: 3, name: 'Book', price: 15.99, category: 'Education' },
  { id: 4, name: 'Headphones', price: 79.99, category: 'Electronics' },
  { id: 5, name: 'Desk Chair', price: 199.99, category: 'Furniture' }
];

// Cache configuration
const CACHE_KEY = 'items:all';
const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 60; // 1 minute in seconds

// Helper function to get next ID
const getNextId = () => {
  return itemsDatabase.length > 0 ? Math.max(...itemsDatabase.map(item => item.id)) + 1 : 1;
};

// Helper function to simulate database delay
const simulateDbDelay = () => {
  return new Promise(resolve => setTimeout(resolve, 100));
};

// GET /items - Fetch all items with caching
app.get('/items', async (req, res) => {
  try {
    console.log('\n🔍 GET /items request received');
    
    // Check cache first
    const cachedData = await redis.get(CACHE_KEY);
    
    if (cachedData) {
      console.log('🎯 Cache HIT - Returning data from Redis');
      const parsedData = JSON.parse(cachedData);
      return res.json({
        success: true,
        source: 'cache',
        data: parsedData,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('💾 Cache MISS - Fetching from database');
    
    // Simulate database fetch delay
    await simulateDbDelay();
    
    // Fetch from "database"
    const items = [...itemsDatabase];
    
    // Cache the data with TTL
    await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(items));
    console.log(`✅ Data cached in Redis with TTL: ${CACHE_TTL} seconds`);
    
    res.json({
      success: true,
      source: 'database',
      data: items,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in GET /items:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// POST /items - Add a new item
app.post('/items', async (req, res) => {
  try {
    console.log('\n➕ POST /items request received');
    
    const { name, price, category } = req.body;
    
    // Validation
    if (!name || !price || !category) {
      return res.status(400).json({
        success: false,
        error: 'Name, price, and category are required'
      });
    }
    
    // Create new item
    const newItem = {
      id: getNextId(),
      name: name.trim(),
      price: parseFloat(price),
      category: category.trim()
    };
    
    // Add to "database"
    itemsDatabase.push(newItem);
    console.log('📝 Item added to database:', newItem);
    
    // Invalidate cache
    const deletedKeys = await redis.del(CACHE_KEY);
    if (deletedKeys > 0) {
      console.log('🗑️ Cache invalidated - Deleted cache key');
    } else {
      console.log('ℹ️ No cache to invalidate');
    }
    
    res.status(201).json({
      success: true,
      message: 'Item created successfully',
      data: newItem,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in POST /items:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// PUT /items/:id - Update an item by ID
app.put('/items/:id', async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    console.log(`\n✏️ PUT /items/${itemId} request received`);
    
    const { name, price, category } = req.body;
    
    // Find item in "database"
    const itemIndex = itemsDatabase.findIndex(item => item.id === itemId);
    
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }
    
    // Update item
    const updatedItem = {
      ...itemsDatabase[itemIndex],
      ...(name && { name: name.trim() }),
      ...(price && { price: parseFloat(price) }),
      ...(category && { category: category.trim() })
    };
    
    itemsDatabase[itemIndex] = updatedItem;
    console.log('📝 Item updated in database:', updatedItem);
    
    // Invalidate cache
    const deletedKeys = await redis.del(CACHE_KEY);
    if (deletedKeys > 0) {
      console.log('🗑️ Cache invalidated - Deleted cache key');
    } else {
      console.log('ℹ️ No cache to invalidate');
    }
    
    res.json({
      success: true,
      message: 'Item updated successfully',
      data: updatedItem,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in PUT /items/:id:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// DELETE /items/:id - Delete an item by ID
app.delete('/items/:id', async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    console.log(`\n🗑️ DELETE /items/${itemId} request received`);
    
    // Find item in "database"
    const itemIndex = itemsDatabase.findIndex(item => item.id === itemId);
    
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }
    
    // Remove item from "database"
    const deletedItem = itemsDatabase.splice(itemIndex, 1)[0];
    console.log('🗑️ Item deleted from database:', deletedItem);
    
    // Invalidate cache
    const deletedKeys = await redis.del(CACHE_KEY);
    if (deletedKeys > 0) {
      console.log('🗑️ Cache invalidated - Deleted cache key');
    } else {
      console.log('ℹ️ No cache to invalidate');
    }
    
    res.json({
      success: true,
      message: 'Item deleted successfully',
      data: deletedItem,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error in DELETE /items/:id:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /cache/info - Get cache information (for debugging)
app.get('/cache/info', async (req, res) => {
  try {
    const exists = await redis.exists(CACHE_KEY);
    let ttl = -1;
    let cachedData = null;
    
    if (exists) {
      ttl = await redis.ttl(CACHE_KEY);
      cachedData = await redis.get(CACHE_KEY);
    }
    
    res.json({
      success: true,
      cache: {
        exists: !!exists,
        ttl: ttl,
        data: cachedData ? JSON.parse(cachedData) : null
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in GET /cache/info:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Redis Caching API is running',
    redis: redis.status,
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
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log('📋 Available endpoints:');
  console.log('   GET    /items       - Fetch all items (with caching)');
  console.log('   POST   /items       - Add a new item');
  console.log('   PUT    /items/:id   - Update an item');
  console.log('   DELETE /items/:id   - Delete an item');
  console.log('   GET    /cache/info  - Cache debugging info');
  console.log('   GET    /health      - Health check');
  console.log(`\n💾 Cache TTL: ${CACHE_TTL} seconds`);
  console.log('🔧 Ready to test Redis caching!\n');
});
