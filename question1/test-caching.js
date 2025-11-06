// Test script to demonstrate Redis caching behavior
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Helper function to make HTTP requests with error handling
const makeRequest = async (method, url, data = null) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      ...(data && { data })
    };
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      return error.response.data;
    }
    throw error;
  }
};

// Test function to demonstrate caching behavior
const testCaching = async () => {
  console.log('🧪 Testing Redis Caching Behavior\n');
  
  try {
    console.log('1️⃣ First GET /items (should be cache MISS):');
    const result1 = await makeRequest('GET', '/items');
    console.log(`   Source: ${result1.source}`);
    console.log(`   Items count: ${result1.data?.length || 0}\n`);
    
    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('2️⃣ Second GET /items (should be cache HIT):');
    const result2 = await makeRequest('GET', '/items');
    console.log(`   Source: ${result2.source}`);
    console.log(`   Items count: ${result2.data?.length || 0}\n`);
    
    console.log('3️⃣ Adding new item (should invalidate cache):');
    const newItem = {
      name: 'Gaming Mouse',
      price: 45.99,
      category: 'Electronics'
    };
    const result3 = await makeRequest('POST', '/items', newItem);
    console.log(`   Added: ${result3.data?.name || 'N/A'}\n`);
    
    console.log('4️⃣ GET /items after POST (should be cache MISS):');
    const result4 = await makeRequest('GET', '/items');
    console.log(`   Source: ${result4.source}`);
    console.log(`   Items count: ${result4.data?.length || 0}\n`);
    
    console.log('5️⃣ Update item (should invalidate cache):');
    const updateData = { price: 49.99 };
    const result5 = await makeRequest('PUT', '/items/6', updateData);
    console.log(`   Updated item: ${result5.data?.name || 'N/A'}\n`);
    
    console.log('6️⃣ GET /items after PUT (should be cache MISS):');
    const result6 = await makeRequest('GET', '/items');
    console.log(`   Source: ${result6.source}`);
    console.log(`   Items count: ${result6.data?.length || 0}\n`);
    
    console.log('7️⃣ Delete item (should invalidate cache):');
    const result7 = await makeRequest('DELETE', '/items/6');
    console.log(`   Deleted: ${result7.data?.name || 'N/A'}\n`);
    
    console.log('8️⃣ Final GET /items (should be cache MISS):');
    const result8 = await makeRequest('GET', '/items');
    console.log(`   Source: ${result8.source}`);
    console.log(`   Items count: ${result8.data?.length || 0}\n`);
    
    console.log('✅ Caching test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

// Run the test
if (require.main === module) {
  console.log('⏳ Waiting 2 seconds for server to start...\n');
  setTimeout(testCaching, 2000);
}

module.exports = { testCaching };
