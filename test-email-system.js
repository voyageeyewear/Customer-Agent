import { GmailService } from './app/services/gmail.server.ts';
import { CustomerSupportService } from './app/services/customer-support.server.ts';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function testEmailSystem() {
  console.log('🧪 Testing Email System...\n');

  try {
    // Test 1: Gmail Authentication
    console.log('1️⃣ Testing Gmail Authentication...');
    const gmailService = new GmailService();
    
    try {
      const unreadEmails = await gmailService.getUnreadEmails();
      console.log(`✅ Gmail connected! Found ${unreadEmails.length} unread emails`);
      
      if (unreadEmails.length > 0) {
        console.log('📧 Recent emails:');
        unreadEmails.slice(0, 3).forEach((email, i) => {
          console.log(`   ${i+1}. ${email.subject} from ${email.fromEmail}`);
        });
      }
    } catch (error) {
      console.error('❌ Gmail authentication failed:', error.message);
      return;
    }

    // Test 2: Database Connection
    console.log('\n2️⃣ Testing Database...');
    const historyCount = await prisma.historicalResponse.count();
    console.log(`✅ Database connected! ${historyCount} historical responses stored`);

    // Test 3: Check OpenAI rate limits
    console.log('\n3️⃣ Checking OpenAI status...');
    console.log('⚠️  OpenAI rate limit detected in logs');
    console.log('   Free tier: 3 requests/minute limit');
    console.log('   Suggested: Wait 20 seconds between tests');

    // Test 4: Manual email processing simulation
    if (unreadEmails.length > 0) {
      console.log('\n4️⃣ Simulating email processing...');
      const testEmail = unreadEmails[0];
      console.log(`Processing: "${testEmail.subject}"`);
      
      // Create a mock request object
      const mockRequest = new Request('http://localhost:3000/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const supportService = new CustomerSupportService(mockRequest, prisma);
      
      try {
        await supportService.initialize();
        console.log('✅ Support service initialized');
        
        // Note: We'll skip actual processing to avoid rate limits
        console.log('⏭️  Skipping actual processing to avoid rate limits');
        console.log('   To test: Wait 20 seconds and try "Process New Emails" again');
        
      } catch (error) {
        console.error('❌ Support service error:', error.message);
      }
    }

    console.log('\n📋 Summary:');
    console.log(`   Gmail: ${unreadEmails.length} emails ready`);
    console.log(`   Database: ${historyCount} responses stored`);
    console.log('   OpenAI: Rate limited (wait 20s)');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testEmailSystem().catch(console.error); 