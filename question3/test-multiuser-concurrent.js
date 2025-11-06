const axios = require('axios');
const moment = require('moment');

const BASE_URL = 'http://localhost:3002';

// Helper function for API requests
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Test data for multiple users
const testUsers = [
  {
    username: 'alice_reader',
    email: 'alice.reader@example.com',
    password: 'password123',
    token: ''
  },
  {
    username: 'bob_bookworm',
    email: 'bob.bookworm@example.com',
    password: 'password123',
    token: ''
  },
  {
    username: 'charlie_writer',
    email: 'charlie.writer@example.com',
    password: 'password123',
    token: ''
  }
];

const bulkBooksData = [
  // Alice's books (Fantasy & Sci-Fi)
  [
    { title: 'The Fellowship of the Ring', author: 'J.R.R. Tolkien', genre: 'Fantasy', publishedYear: 1954 },
    { title: 'The Two Towers', author: 'J.R.R. Tolkien', genre: 'Fantasy', publishedYear: 1954 },
    { title: 'The Return of the King', author: 'J.R.R. Tolkien', genre: 'Fantasy', publishedYear: 1955 },
    { title: 'Dune', author: 'Frank Herbert', genre: 'Science Fiction', publishedYear: 1965 },
    { title: 'Foundation', author: 'Isaac Asimov', genre: 'Science Fiction', publishedYear: 1951 }
  ],
  // Bob's books (Mystery & Thriller)
  [
    { title: 'The Maltese Falcon', author: 'Dashiell Hammett', genre: 'Mystery', publishedYear: 1930 },
    { title: 'The Big Sleep', author: 'Raymond Chandler', genre: 'Mystery', publishedYear: 1939 },
    { title: 'Gone Girl', author: 'Gillian Flynn', genre: 'Thriller', publishedYear: 2012 },
    { title: 'The Girl with the Dragon Tattoo', author: 'Stieg Larsson', genre: 'Thriller', publishedYear: 2005 },
    { title: 'In the Woods', author: 'Tana French', genre: 'Mystery', publishedYear: 2007 },
    { title: 'The Silent Patient', author: 'Alex Michaelides', genre: 'Thriller', publishedYear: 2019 }
  ],
  // Charlie's books (Literature & Poetry)
  [
    { title: 'To Kill a Mockingbird', author: 'Harper Lee', genre: 'Literature', publishedYear: 1960 },
    { title: '1984', author: 'George Orwell', genre: 'Dystopian Fiction', publishedYear: 1949 },
    { title: 'Pride and Prejudice', author: 'Jane Austen', genre: 'Literature', publishedYear: 1813 },
    { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', genre: 'Literature', publishedYear: 1925 },
    { title: 'Leaves of Grass', author: 'Walt Whitman', genre: 'Poetry', publishedYear: 1855 },
    { title: 'The Waste Land', author: 'T.S. Eliot', genre: 'Poetry', publishedYear: 1922 },
    { title: 'Howl and Other Poems', author: 'Allen Ginsberg', genre: 'Poetry', publishedYear: 1956 }
  ]
];

// Add auth token to requests
const createAuthenticatedApi = (token) => {
  return axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
};

async function testMultiUserConcurrentFlow() {
  console.log('🧪 Testing Multi-User Concurrent Books Management with Reporting\n');
  console.log('=' * 80);

  try {
    // Phase 1: User Registration
    console.log('\n🔸 PHASE 1: User Registration and Authentication');
    console.log('-'.repeat(60));
    
    for (let i = 0; i < testUsers.length; i++) {
      const user = testUsers[i];
      console.log(`\n👤 Registering user ${i + 1}: ${user.username}`);
      
      try {
        const signupResponse = await api.post('/auth/signup', user);
        user.token = signupResponse.data.token;
        console.log(`   ✅ ${user.username} registered successfully`);
        console.log(`   📧 Email: ${user.email}`);
      } catch (error) {
        console.log(`   ❌ Registration failed: ${error.response?.data?.error || error.message}`);
        
        // Try to login if user already exists
        try {
          const loginResponse = await api.post('/auth/login', {
            email: user.email,
            password: user.password
          });
          user.token = loginResponse.data.token;
          console.log(`   ✅ ${user.username} logged in successfully (existing user)`);
        } catch (loginError) {
          console.log(`   ❌ Login also failed: ${loginError.response?.data?.error || loginError.message}`);
        }
      }
    }

    // Phase 2: Verify User Isolation
    console.log('\n🔸 PHASE 2: Verify User Data Isolation');
    console.log('-'.repeat(60));
    
    for (let i = 0; i < testUsers.length; i++) {
      const user = testUsers[i];
      if (!user.token) continue;
      
      const userApi = createAuthenticatedApi(user.token);
      const booksResponse = await userApi.get('/books');
      console.log(`   📚 ${user.username}: ${booksResponse.data.count} books (${booksResponse.data.source})`);
    }

    // Phase 3: Concurrent Bulk Submissions
    console.log('\n🔸 PHASE 3: Concurrent Bulk Book Submissions');
    console.log('-'.repeat(60));
    
    const bulkPromises = [];
    const submissionResults = [];
    
    for (let i = 0; i < testUsers.length; i++) {
      const user = testUsers[i];
      if (!user.token) continue;
      
      const userApi = createAuthenticatedApi(user.token);
      const books = bulkBooksData[i];
      
      console.log(`📦 Submitting ${books.length} books for ${user.username}...`);
      
      const bulkPromise = userApi.post('/books/bulk', { books })
        .then(response => {
          const result = {
            username: user.username,
            success: true,
            requestId: response.data.data.requestId,
            booksCount: response.data.data.queuedBooks,
            message: response.data.message
          };
          submissionResults.push(result);
          console.log(`   ✅ ${user.username}: Queued ${result.booksCount} books (ID: ${result.requestId})`);
          return result;
        })
        .catch(error => {
          const result = {
            username: user.username,
            success: false,
            error: error.response?.data?.error || error.message
          };
          submissionResults.push(result);
          console.log(`   ❌ ${user.username}: ${result.error}`);
          return result;
        });
      
      bulkPromises.push(bulkPromise);
    }
    
    // Wait for all submissions to complete
    await Promise.all(bulkPromises);
    console.log(`\n📋 All bulk submissions completed: ${submissionResults.filter(r => r.success).length}/${submissionResults.length} successful`);

    // Phase 4: Monitor Queue Status
    console.log('\n🔸 PHASE 4: Monitor Processing Status');
    console.log('-'.repeat(60));
    
    const maxChecks = 15; // Check for up to 15 iterations (about 5 minutes)
    let allProcessed = false;
    
    for (let check = 1; check <= maxChecks && !allProcessed; check++) {
      console.log(`\n🔍 Status Check ${check}/${maxChecks} (${moment().format('HH:mm:ss')})`);
      
      let queueCount = 0;
      let processingCount = 0;
      let completedCount = 0;
      
      for (const user of testUsers) {
        if (!user.token) continue;
        
        try {
          const userApi = createAuthenticatedApi(user.token);
          const queueResponse = await userApi.get('/books/queue');
          const status = queueResponse.data.data;
          
          if (status.queued) {
            queueCount++;
            console.log(`   ⏳ ${user.username}: Queued (${status.booksCount} books)`);
          } else if (status.processing) {
            processingCount++;
            console.log(`   🔄 ${user.username}: Processed (${status.successCount}/${status.totalBooks} success), awaiting report`);
          } else {
            completedCount++;
            console.log(`   ✅ ${user.username}: Completed`);
          }
        } catch (error) {
          console.log(`   ❌ ${user.username}: Status check failed`);
        }
      }
      
      console.log(`   📊 Summary: ${queueCount} queued, ${processingCount} processed, ${completedCount} completed`);
      
      // Check admin stats
      try {
        const adminResponse = await api.get('/admin/stats');
        const stats = adminResponse.data.data;
        console.log(`   🔧 System: ${stats.pendingBulkJobs} bulk jobs, ${stats.pendingReports} reports pending`);
      } catch (error) {
        console.log(`   ⚠️ Could not fetch admin stats`);
      }
      
      if (queueCount === 0 && processingCount === 0) {
        allProcessed = true;
        console.log('\n🎉 All users have completed processing and received reports!');
      } else {
        console.log(`\n⏰ Waiting 20 seconds before next check...`);
        await sleep(20000);
      }
    }
    
    if (!allProcessed) {
      console.log('\n⚠️ Timeout reached. Some processes may still be running.');
    }

    // Phase 5: Final Verification
    console.log('\n🔸 PHASE 5: Final Books Count Verification');
    console.log('-'.repeat(60));
    
    let totalBooksExpected = 0;
    let totalBooksFound = 0;
    
    for (let i = 0; i < testUsers.length; i++) {
      const user = testUsers[i];
      if (!user.token) continue;
      
      const expectedCount = bulkBooksData[i].length;
      totalBooksExpected += expectedCount;
      
      try {
        const userApi = createAuthenticatedApi(user.token);
        const booksResponse = await userApi.get('/books');
        const actualCount = booksResponse.data.count;
        totalBooksFound += actualCount;
        
        const status = actualCount === expectedCount ? '✅' : '❌';
        console.log(`   ${status} ${user.username}: ${actualCount}/${expectedCount} books (${booksResponse.data.source})`);
        
        if (actualCount > 0) {
          // Show some sample books
          const sampleBooks = booksResponse.data.data.slice(0, 2);
          sampleBooks.forEach(book => {
            console.log(`      📖 "${book.title}" by ${book.author} (${book.genre || 'No genre'})`);
          });
          if (booksResponse.data.data.length > 2) {
            console.log(`      📚 ... and ${booksResponse.data.data.length - 2} more books`);
          }
        }
      } catch (error) {
        console.log(`   ❌ ${user.username}: Could not fetch books - ${error.message}`);
      }
    }

    // Test Summary
    console.log('\n🔸 FINAL SUMMARY');
    console.log('='.repeat(60));
    console.log(`👥 Users Registered: ${testUsers.filter(u => u.token).length}/${testUsers.length}`);
    console.log(`📦 Bulk Submissions: ${submissionResults.filter(r => r.success).length}/${submissionResults.length} successful`);
    console.log(`📚 Total Books Expected: ${totalBooksExpected}`);
    console.log(`📚 Total Books Found: ${totalBooksFound}`);
    console.log(`📧 Email Reports: Should be sent to all users`);
    console.log(`⏰ Processing Time: Bulk processing every 2 minutes, Reports every 5 minutes`);
    
    if (totalBooksFound >= totalBooksExpected * 0.95) { // Allow for 5% failure rate
      console.log('\n🎉 ✅ MULTI-USER CONCURRENT TEST COMPLETED SUCCESSFULLY!');
      console.log('📧 Check your email inboxes for PDF reports!');
    } else {
      console.log('\n⚠️ ❌ Some books may not have been processed correctly.');
      console.log('📧 Reports should still be generated for processed books.');
    }
    
    console.log('\n📌 Next Steps:');
    console.log('   1. Check email inboxes for PDF reports');
    console.log('   2. Verify PDF content matches processing results');
    console.log('   3. Test with different email addresses');
    console.log('   4. Monitor server logs for cron job activities');

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.response?.data || error.message);
  }
}

// Quick single user test
async function testSingleUserQuick() {
  console.log('🚀 Quick Single User Test\n');
  
  try {
    const testUser = {
      username: 'quicktest' + Date.now(),
      email: `quicktest${Date.now()}@example.com`,
      password: 'test123'
    };
    
    // Register
    console.log('1. Registering user...');
    const signupResponse = await api.post('/auth/signup', testUser);
    const token = signupResponse.data.token;
    console.log(`✅ User registered: ${testUser.username}`);
    
    // Submit bulk books
    console.log('2. Submitting bulk books...');
    const userApi = createAuthenticatedApi(token);
    const quickBooks = [
      { title: 'Quick Test Book 1', author: 'Test Author 1', genre: 'Test' },
      { title: 'Quick Test Book 2', author: 'Test Author 2', genre: 'Test' },
      { title: 'Quick Test Book 3', author: 'Test Author 3', genre: 'Test' }
    ];
    
    const bulkResponse = await userApi.post('/books/bulk', { books: quickBooks });
    console.log(`✅ Queued ${bulkResponse.data.data.queuedBooks} books`);
    console.log(`📧 Report will be sent to: ${testUser.email}`);
    console.log(`🆔 Request ID: ${bulkResponse.data.data.requestId}`);
    
    console.log('\n⏰ Wait 2-7 minutes for processing and email report...');
    
  } catch (error) {
    console.error('❌ Quick test failed:', error.response?.data || error.message);
  }
}

// Main execution
if (require.main === module) {
  const testType = process.argv[2] || 'full';
  
  if (testType === 'quick') {
    console.log('⏳ Starting quick test in 3 seconds...\n');
    setTimeout(testSingleUserQuick, 3000);
  } else {
    console.log('⏳ Starting full multi-user test in 3 seconds...\n');
    setTimeout(testMultiUserConcurrentFlow, 3000);
  }
}

module.exports = { testMultiUserConcurrentFlow, testSingleUserQuick };
