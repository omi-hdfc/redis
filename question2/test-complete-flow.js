const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
let authToken = '';

// Helper function for API requests
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
});

// Add auth token to requests
api.interceptors.request.use(config => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Test user data
const testUser = {
  username: 'testuser' + Date.now(),
  email: `test${Date.now()}@example.com`,
  password: 'testpass123'
};

const testBooks = [
  { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', genre: 'Fiction', publishedYear: 1925 },
  { title: '1984', author: 'George Orwell', genre: 'Dystopian', publishedYear: 1949 },
  { title: 'To Kill a Mockingbird', author: 'Harper Lee', genre: 'Fiction', publishedYear: 1960 }
];

const bulkBooks = [
  { title: 'Harry Potter 1', author: 'J.K. Rowling', genre: 'Fantasy', publishedYear: 1997 },
  { title: 'Harry Potter 2', author: 'J.K. Rowling', genre: 'Fantasy', publishedYear: 1998 },
  { title: 'Harry Potter 3', author: 'J.K. Rowling', genre: 'Fantasy', publishedYear: 1999 },
  { title: 'The Hobbit', author: 'J.R.R. Tolkien', genre: 'Fantasy', publishedYear: 1937 },
  { title: 'Dune', author: 'Frank Herbert', genre: 'Sci-Fi', publishedYear: 1965 }
];

async function testCompleteFlow() {
  console.log('🧪 Testing Complete Books Management Flow\n');

  try {
    // 1. User Signup
    console.log('1️⃣ Testing User Signup...');
    const signupResponse = await api.post('/auth/signup', testUser);
    console.log(`   ✅ User created: ${signupResponse.data.data.username}`);
    authToken = signupResponse.data.token;
    console.log(`   🔑 Auth token received\n`);

    // 2. User Login
    console.log('2️⃣ Testing User Login...');
    const loginResponse = await api.post('/auth/login', {
      email: testUser.email,
      password: testUser.password
    });
    console.log(`   ✅ Login successful: ${loginResponse.data.data.username}`);
    authToken = loginResponse.data.token;
    console.log(`   🔑 New auth token received\n`);

    // 3. Get user info
    console.log('3️⃣ Getting Current User Info...');
    const meResponse = await api.get('/auth/me');
    console.log(`   ✅ Current user: ${meResponse.data.data.username} (${meResponse.data.data.email})\n`);

    // 4. Get books (should be empty and cache miss)
    console.log('4️⃣ Testing GET /books (empty, cache miss)...');
    const emptyBooksResponse = await api.get('/books');
    console.log(`   📚 Books count: ${emptyBooksResponse.data.count}`);
    console.log(`   🔍 Source: ${emptyBooksResponse.data.source}\n`);

    // 5. Add individual books
    console.log('5️⃣ Adding Individual Books...');
    let addedBooks = [];
    for (const book of testBooks) {
      const response = await api.post('/books', book);
      addedBooks.push(response.data.data);
      console.log(`   📖 Added: "${book.title}" by ${book.author}`);
    }
    console.log(`   ✅ Added ${addedBooks.length} books individually\n`);

    // 6. Get books (should be cache miss after additions)
    console.log('6️⃣ Testing GET /books (after additions, cache miss)...');
    const booksResponse1 = await api.get('/books');
    console.log(`   📚 Books count: ${booksResponse1.data.count}`);
    console.log(`   🔍 Source: ${booksResponse1.data.source}\n`);

    // 7. Get books again (should be cache hit)
    console.log('7️⃣ Testing GET /books (cache hit)...');
    const booksResponse2 = await api.get('/books');
    console.log(`   📚 Books count: ${booksResponse2.data.count}`);
    console.log(`   🔍 Source: ${booksResponse2.data.source}\n`);

    // 8. Update a book
    console.log('8️⃣ Testing Book Update...');
    const bookToUpdate = addedBooks[0];
    const updateResponse = await api.put(`/books/${bookToUpdate.id}`, {
      ...bookToUpdate,
      genre: 'Classic Literature'
    });
    console.log(`   ✏️ Updated: "${updateResponse.data.data.title}" genre to "${updateResponse.data.data.genre}"\n`);

    // 9. Get books after update (should be cache miss)
    console.log('9️⃣ Testing GET /books (after update, cache miss)...');
    const booksResponse3 = await api.get('/books');
    console.log(`   📚 Books count: ${booksResponse3.data.count}`);
    console.log(`   🔍 Source: ${booksResponse3.data.source}\n`);

    // 10. Bulk books submission
    console.log('🔟 Testing Bulk Books Submission...');
    const bulkResponse = await api.post('/books/bulk', { books: bulkBooks });
    console.log(`   📦 Queued ${bulkResponse.data.data.queuedBooks} books for bulk processing`);
    console.log(`   ⏰ Estimated processing time: ${bulkResponse.data.data.estimatedProcessingTime}\n`);

    // 11. Check queue status
    console.log('1️⃣1️⃣ Checking Bulk Queue Status...');
    const queueResponse = await api.get('/books/queue');
    if (queueResponse.data.data.queued) {
      console.log(`   📋 Queue status: ${queueResponse.data.data.booksCount} books queued`);
      console.log(`   🕒 Queued at: ${queueResponse.data.data.queuedAt}\n`);
    } else {
      console.log(`   📭 No books in queue\n`);
    }

    // 12. Wait for bulk processing (2+ minutes)
    console.log('1️⃣2️⃣ Waiting for Bulk Processing...');
    console.log('   ⏳ Waiting 130 seconds for cron job to process bulk books...');
    
    let processed = false;
    let attempts = 0;
    const maxAttempts = 13; // Check every 10 seconds for 130 seconds
    
    while (!processed && attempts < maxAttempts) {
      await sleep(10000); // Wait 10 seconds
      attempts++;
      
      try {
        const checkQueue = await api.get('/books/queue');
        const checkBooks = await api.get('/books');
        
        console.log(`   🔍 Attempt ${attempts}/${maxAttempts}: Books count = ${checkBooks.data.count}, Queue = ${checkQueue.data.data.queued ? 'Active' : 'Empty'}`);
        
        if (!checkQueue.data.data.queued && checkBooks.data.count > testBooks.length) {
          processed = true;
          console.log('   ✅ Bulk processing completed!\n');
        }
      } catch (error) {
        console.log(`   ⚠️ Check failed: ${error.message}`);
      }
    }

    // 13. Verify bulk books were added
    console.log('1️⃣3️⃣ Verifying Bulk Books Processing...');
    const finalBooksResponse = await api.get('/books');
    console.log(`   📚 Final books count: ${finalBooksResponse.data.count}`);
    console.log(`   🔍 Source: ${finalBooksResponse.data.source}`);
    
    if (finalBooksResponse.data.count >= testBooks.length + bulkBooks.length) {
      console.log('   ✅ Bulk books successfully processed and added!\n');
    } else {
      console.log('   ⚠️ Bulk books may still be processing...\n');
    }

    // 14. Delete a book
    console.log('1️⃣4️⃣ Testing Book Deletion...');
    const bookToDelete = addedBooks[1];
    const deleteResponse = await api.delete(`/books/${bookToDelete.id}`);
    console.log(`   🗑️ Deleted: "${deleteResponse.data.data.title}"\n`);

    // 15. Final books check
    console.log('1️⃣5️⃣ Final Books Check (after deletion, cache miss)...');
    const finalCheckResponse = await api.get('/books');
    console.log(`   📚 Final books count: ${finalCheckResponse.data.count}`);
    console.log(`   🔍 Source: ${finalCheckResponse.data.source}\n`);

    console.log('🎉 All tests completed successfully!');
    console.log('\n📊 Test Summary:');
    console.log(`   👤 User: ${testUser.username}`);
    console.log(`   📚 Individual books added: ${testBooks.length}`);
    console.log(`   📦 Bulk books queued: ${bulkBooks.length}`);
    console.log(`   🗑️ Books deleted: 1`);
    console.log(`   📊 Final count: ${finalCheckResponse.data.count}`);

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run tests
if (require.main === module) {
  console.log('⏳ Waiting 3 seconds for server to start...\n');
  setTimeout(testCompleteFlow, 3000);
}

module.exports = { testCompleteFlow };
