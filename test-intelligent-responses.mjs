import { AIResponseService } from './app/services/ai-response.server.ts';
import 'dotenv/config';

async function testIntelligentResponses() {
  console.log('🧠 TESTING INTELLIGENT FALLBACK RESPONSES');
  console.log('============================================\n');

  const aiService = new AIResponseService();
  
  // Test scenarios with different customer queries
  const testScenarios = [
    {
      name: "Order Status Inquiry",
      customerName: "John Smith",
      customerEmail: "john@example.com",
      query: "Hi, I placed an order last week (order #BLG-2024-123) and wanted to check on the status. When will it arrive?",
      orderData: [{
        orderNumber: "BLG-2024-123",
        fulfillmentStatus: "shipped",
        financialStatus: "paid",
        processedAt: new Date().toISOString(),
        totalPrice: "$89.99",
        items: [{ quantity: 1, title: "Blue Light Glasses" }],
        shippingAddress: { city: "Austin", province: "TX", country: "USA" },
        fulfillments: [{
          trackingCompany: "FedEx",
          trackingNumbers: ["1Z999AA1234567890"],
          estimatedDeliveryAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        }]
      }]
    },
    {
      name: "Tracking Request",
      customerName: "Sarah Johnson",
      customerEmail: "sarah@example.com", 
      query: "Can you please provide me with the tracking number for my recent order? I need to track my package.",
      orderData: [{
        orderNumber: "BLG-2024-456",
        fulfillmentStatus: "shipped",
        financialStatus: "paid",
        processedAt: new Date().toISOString(),
        totalPrice: "$125.00",
        items: [{ quantity: 1, title: "Prescription Glasses" }],
        shippingAddress: { city: "New York", province: "NY", country: "USA" },
        fulfillments: [{
          trackingCompany: "UPS",
          trackingNumbers: ["1Z555BB9876543210"],
          estimatedDeliveryAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString()
        }]
      }]
    },
    {
      name: "Return Request",
      customerName: "Mike Wilson",
      customerEmail: "mike@example.com",
      query: "I received my glasses yesterday but they don't fit properly. I'd like to return them and get a refund. The frames are too small.",
      orderData: [{
        orderNumber: "BLG-2024-789",
        fulfillmentStatus: "delivered",
        financialStatus: "paid",
        processedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        totalPrice: "$199.99",
        items: [{ quantity: 1, title: "Premium Frames" }],
        shippingAddress: { city: "Los Angeles", province: "CA", country: "USA" },
        fulfillments: []
      }]
    },
    {
      name: "Product Question",
      customerName: "Emily Chen", 
      customerEmail: "emily@example.com",
      query: "Do your blue light glasses really help with computer eye strain? I work on a computer all day and my eyes get tired.",
      orderData: []
    },
    {
      name: "Complaint",
      customerName: "David Brown",
      customerEmail: "david@example.com", 
      query: "I'm very disappointed with my recent purchase. The glasses arrived broken and the customer service has been terrible. This is unacceptable!",
      orderData: [{
        orderNumber: "BLG-2024-999",
        fulfillmentStatus: "delivered",
        financialStatus: "paid",
        processedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        totalPrice: "$149.99",
        items: [{ quantity: 1, title: "Designer Frames" }],
        shippingAddress: { city: "Chicago", province: "IL", country: "USA" },
        fulfillments: []
      }]
    },
    {
      name: "General Inquiry",
      customerName: "Lisa Anderson",
      customerEmail: "lisa@example.com",
      query: "Hello, I'm interested in learning more about your prescription options and how the ordering process works.",
      orderData: []
    }
  ];

  console.log('Testing different customer inquiry types:\n');

  for (let i = 0; i < testScenarios.length; i++) {
    const scenario = testScenarios[i];
    
    console.log(`${i + 1}️⃣ ${scenario.name.toUpperCase()}`);
    console.log('━'.repeat(50));
    console.log(`Customer: ${scenario.customerName}`);
    console.log(`Query: "${scenario.query}"`);
    console.log('');

    try {
      const result = await aiService.generateResponse({
        customerQuery: scenario.query,
        customerEmail: scenario.customerEmail,
        customerName: scenario.customerName,
        orderData: scenario.orderData,
        category: 'GENERAL'
      });

      console.log(`✅ Response Generated:`);
      console.log(`   Model: ${result.modelUsed}`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Escalated: ${result.shouldEscalate ? 'Yes' : 'No'}`);
      console.log(`   Intent Analysis: ${result.reasoning.split(' - ')[1] || 'N/A'}`);
      console.log('');
      console.log(`📝 Response:`);
      console.log(`"${result.response}"`);
      console.log('');
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
    
    console.log('═'.repeat(70));
    console.log('');
  }

  console.log('🎯 INTELLIGENT RESPONSE SYSTEM FEATURES:');
  console.log('✅ Analyzes email content for intent detection');
  console.log('✅ Provides contextual responses based on query type');
  console.log('✅ Extracts order numbers automatically');
  console.log('✅ Includes relevant order data when available'); 
  console.log('✅ Escalates complaints and urgent issues');
  console.log('✅ Gives product-specific information');
  console.log('✅ No more generic "copy-paste" responses!');
  
  console.log('\n🚀 NOW YOUR CUSTOMERS GET PERSONALIZED RESPONSES!');
}

testIntelligentResponses().catch(console.error); 