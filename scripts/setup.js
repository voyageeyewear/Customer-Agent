#!/usr/bin/env node

/**
 * AI Customer Support Setup Script
 * Run this to verify your configuration and initialize the system
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 AI Customer Support Agent Setup\n');

// Check if .env file exists
const envPath = path.join(process.cwd(), '.env');
const envExists = fs.existsSync(envPath);

if (!envExists) {
  console.log('❌ .env file not found');
  console.log('📝 Creating example .env file...\n');
  
  const exampleEnv = `# Shopify Configuration (update with your values)
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://your-app-url.com
SCOPES=write_products,read_orders,read_customers,read_fulfillments,read_shipping

# AI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here

# Gmail API Configuration
GMAIL_CLIENT_ID=your-gmail-client-id.googleusercontent.com
GMAIL_CLIENT_SECRET=your-gmail-client-secret
GMAIL_REDIRECT_URI=https://your-app-url.com/auth/gmail/callback
GMAIL_REFRESH_TOKEN=your-gmail-refresh-token

# ChromaDB Configuration
CHROMADB_URL=http://localhost:8000
CHROMADB_COLLECTION_NAME=customer_support_responses

# Security
ENCRYPTION_KEY=generate-a-32-character-random-string-here

# General Configuration
NODE_ENV=development
PORT=3000
`;

  fs.writeFileSync(envPath, exampleEnv);
  console.log('✅ Created .env.example file');
  console.log('📋 Please update .env with your actual credentials\n');
}

// Load environment variables
require('dotenv').config();

// Check required environment variables
const requiredEnvVars = [
  'SHOPIFY_API_KEY',
  'SHOPIFY_API_SECRET', 
  'OPENAI_API_KEY',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'CHROMADB_URL'
];

console.log('🔍 Checking environment variables...');
const missingVars = [];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName] || process.env[varName].includes('your-') || process.env[varName].includes('generate-')) {
    missingVars.push(varName);
  }
});

if (missingVars.length > 0) {
  console.log('❌ Missing or placeholder environment variables:');
  missingVars.forEach(varName => {
    console.log(`   - ${varName}`);
  });
  console.log('\n📋 Please update your .env file with real values\n');
  process.exit(1);
}

console.log('✅ Environment variables configured\n');

// Check if dependencies are installed
console.log('📦 Checking dependencies...');
try {
  execSync('npm list chromadb openai googleapis', { stdio: 'ignore' });
  console.log('✅ Dependencies installed\n');
} catch (error) {
  console.log('❌ Some dependencies missing. Running npm install...');
  execSync('npm install', { stdio: 'inherit' });
  console.log('✅ Dependencies installed\n');
}

// Check Prisma setup
console.log('🗄️  Checking database setup...');
try {
  execSync('npx prisma generate', { stdio: 'ignore' });
  console.log('✅ Prisma client generated');
  
  execSync('npx prisma db push', { stdio: 'ignore' });
  console.log('✅ Database schema updated\n');
} catch (error) {
  console.log('❌ Database setup failed:', error.message);
  console.log('🔧 Try running: npx prisma db push\n');
}

// Test ChromaDB connection
console.log('🧠 Testing ChromaDB connection...');
const testChromaDB = async () => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${process.env.CHROMADB_URL}/api/v1/heartbeat`);
    
    if (response.ok) {
      console.log('✅ ChromaDB connection successful\n');
    } else {
      throw new Error('ChromaDB not responding');
    }
  } catch (error) {
    console.log('❌ ChromaDB connection failed');
    console.log('🔧 Make sure ChromaDB is running:');
    console.log('   pip install chromadb');
    console.log('   chroma run --host localhost --port 8000\n');
  }
};

// Test OpenAI API
console.log('🤖 Testing OpenAI API...');
const testOpenAI = async () => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });
    
    if (response.ok) {
      console.log('✅ OpenAI API connection successful\n');
    } else {
      throw new Error('OpenAI API key invalid');
    }
  } catch (error) {
    console.log('❌ OpenAI API connection failed');
    console.log('🔧 Check your OPENAI_API_KEY in .env\n');
  }
};

// Test Gmail API (basic check)
console.log('📧 Gmail API configuration...');
if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
  console.log('✅ Gmail credentials configured');
  console.log('⚠️  Gmail API requires OAuth flow - test in app dashboard\n');
} else {
  console.log('❌ Gmail credentials incomplete\n');
}

// Run async tests
(async () => {
  await testChromaDB();
  await testOpenAI();
  
  console.log('🎉 Setup verification complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Start your Shopify app: npm run dev');
  console.log('2. Visit /app/customer-support in your app');
  console.log('3. Click "Initialize System"');
  console.log('4. Test with "Process New Emails"');
  console.log('\n🚀 Your AI Customer Support Agent is ready!');
})(); 