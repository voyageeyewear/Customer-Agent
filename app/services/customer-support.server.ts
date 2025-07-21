import { GmailService, type GmailEmail } from './gmail.server';
import { ShopifyOrdersService, type ShopifyOrder } from './shopify-orders.server';
import { RAGService, type SimilarResponse, type QueryCategory } from './rag.server';
import { AIResponseService, type AIGeneratedResponse } from './ai-response.server';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

export class CustomerSupportService {
  private gmailService: GmailService;
  private ragService: RAGService;
  private aiService: AIResponseService;
  private prisma: PrismaClient;

  constructor(private request: Request, prisma: PrismaClient) {
    this.gmailService = new GmailService();
    this.ragService = new RAGService();
    this.aiService = new AIResponseService();
    this.prisma = prisma;
  }

  /**
   * Initialize the customer support system
   */
  async initialize(): Promise<void> {
    try {
      console.log('Starting customer support system initialization...');
      
      // Initialize RAG system
      try {
        await this.ragService.initialize();
        console.log('RAG system initialized successfully');
      } catch (ragError) {
        console.warn('RAG system initialization failed, continuing without it:', ragError);
      }
      
      // Load sample historical responses if none exist
      const existingResponses = await this.prisma.historicalResponse.count();
      console.log(`Found ${existingResponses} existing historical responses`);
      
      if (existingResponses === 0) {
        console.log('Loading sample historical responses...');
        const sampleResponses = RAGService.getSampleHistoricalResponses();
        await this.loadHistoricalResponsesSimple(sampleResponses);
        console.log('Sample responses loaded successfully');
      }
      
      console.log('Customer support system initialized successfully');
    } catch (error) {
      console.error('Error initializing customer support system:', error);
      throw new Error('Failed to initialize customer support system');
    }
  }

  /**
   * Process unread emails from Gmail
   */
  async processUnreadEmails(): Promise<ProcessedEmailResults> {
    try {
      const results: ProcessedEmailResults = {
        totalProcessed: 0,
        successful: 0,
        escalated: 0,
        failed: 0,
        errors: []
      };

      // Get unread emails
      const unreadEmails = await this.gmailService.getUnreadEmails();
      results.totalProcessed = unreadEmails.length;

      for (const email of unreadEmails) {
        try {
          const result = await this.processEmail(email);
          
          if (result.success) {
            results.successful++;
            if (result.escalated) {
              results.escalated++;
            }
          } else {
            results.failed++;
            results.errors.push({
              emailId: email.id,
              error: result.error || 'Unknown error'
            });
          }

          // Mark email as read regardless of success/failure
          await this.gmailService.markAsRead(email.id);
        } catch (error) {
          results.failed++;
          results.errors.push({
            emailId: email.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error processing unread emails:', error);
      throw new Error('Failed to process unread emails');
    }
  }

  /**
   * Process a single email
   */
  async processEmail(email: GmailEmail): Promise<EmailProcessResult> {
    try {
      // 1. Check if email already exists in database
      const existingEmail = await this.prisma.customerEmail.findUnique({
        where: { gmailMessageId: email.id }
      });

      if (existingEmail) {
        return {
          success: true,
          escalated: false,
          message: 'Email already processed'
        };
      }

      // 2. Find or create conversation
      let conversation = await this.prisma.conversation.findFirst({
        where: { customerEmail: email.fromEmail },
        include: { emails: true, responses: true }
      });

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            customerEmail: email.fromEmail,
            customerName: email.fromName,
            status: 'ACTIVE',
            priority: 'NORMAL'
          },
          include: { emails: true, responses: true }
        });
      }

      // 3. Save email to database
      const savedEmail = await this.prisma.customerEmail.create({
        data: {
          gmailMessageId: email.id,
          threadId: email.threadId,
          subject: email.subject,
          fromEmail: email.fromEmail,
          fromName: email.fromName,
          body: email.body,
          htmlBody: email.htmlBody,
          receivedAt: email.receivedAt,
          conversationId: conversation.id
        }
      });

      // 4. Extract order number if mentioned
      const orderNumber = ShopifyOrdersService.extractOrderNumber(email.body);
      if (orderNumber && !conversation.shopifyOrderId) {
        await this.prisma.conversation.update({
          where: { id: conversation.id },
          data: { shopifyOrderId: orderNumber }
        });
      }

      // 5. Get order data from Shopify
      const shopifyService = new ShopifyOrdersService(this.request);
      let orderData: ShopifyOrder[] = [];
      
      try {
        if (orderNumber) {
          const order = await shopifyService.findOrderByNumber(orderNumber);
          if (order) orderData = [order];
        } else {
          orderData = await shopifyService.findOrdersByEmail(email.fromEmail);
        }
      } catch (error) {
        console.warn('Error fetching Shopify orders:', error);
        // Continue without order data
      }

      // 6. Classify query and extract information
      const category = await this.ragService.classifyQuery(email.body);
      const queryInfo = await this.ragService.extractQueryInfo(email.body);

      // 7. Search for similar responses
      const similarResponses = await this.ragService.searchSimilarResponses(email.body, 3);

      // 8. Generate AI response
      const aiResponse = await this.aiService.generateResponse({
        customerQuery: email.body,
        customerEmail: email.fromEmail,
        customerName: email.fromName,
        orderData,
        similarResponses,
        category,
        context: `Subject: ${email.subject}`
      });

      // 9. Validate response quality
      const validation = this.aiService.validateResponse(aiResponse.response);

      // 10. Determine if response should be escalated
      const shouldEscalate = aiResponse.shouldEscalate || 
                            !validation.isValid || 
                            validation.score < 0.6;

      // 11. Save AI response to database  
      let finalResponse: string;
      let isIntelligentFallback = false;
      
      if (shouldEscalate) {
        // Use intelligent fallback even for escalations
        const intelligentFallback = this.aiService.generateFallbackResponse({
          customerQuery: email.body,
          customerEmail: email.fromEmail,
          customerName: email.fromName,
          orderData: orderData,
          similarResponses: similarResponses,
          category: category
        }, 'escalation');
        finalResponse = intelligentFallback.response;
        isIntelligentFallback = true;
      } else {
        finalResponse = aiResponse.response;
      }
      
      const savedResponse = await this.prisma.aIResponse.create({
        data: {
          responseText: finalResponse,
          confidence: aiResponse.confidence,
          sentViaGmail: false,
          humanReviewed: shouldEscalate,
          escalated: shouldEscalate,
          conversationId: conversation.id,
          shopifyData: orderData.length > 0 ? JSON.stringify(orderData) : null,
          ragSources: similarResponses.length > 0 ? JSON.stringify(similarResponses) : null,
          promptUsed: aiResponse.promptUsed
        }
      });

      // 12. Send response via Gmail (or create draft if escalated)
      let emailSent = false;
      const shouldSendDirectly = !shouldEscalate || isIntelligentFallback;
      
      if (shouldSendDirectly) {
        // Send automated response (including intelligent fallback responses)
        emailSent = await this.gmailService.sendReply(
          email.fromEmail,
          `Re: ${email.subject}`,
          savedResponse.responseText,
          email.threadId
        );

        if (emailSent) {
          await this.prisma.aIResponse.update({
            where: { id: savedResponse.id },
            data: {
              sentViaGmail: true,
              sentAt: new Date()
            }
          });
          console.log(`Email sent automatically ${isIntelligentFallback ? '(intelligent fallback)' : '(AI response)'}`);
        }
      } else {
        // Create draft for human review (only for genuine escalations)
        const draftId = await this.gmailService.createDraft(
          email.fromEmail,
          `Re: ${email.subject}`,
          savedResponse.responseText,
          email.threadId
        );
        
        console.log(`Email escalated - Draft created: ${draftId}`);
      }

      // 13. Update conversation status
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: shouldEscalate ? 'ESCALATED' : 'ACTIVE',
          priority: this.determinePriority(category, email.body),
          updatedAt: new Date()
        }
      });

      // 14. Mark email as processed
      await this.prisma.customerEmail.update({
        where: { id: savedEmail.id },
        data: { processed: true }
      });

      return {
        success: true,
        escalated: shouldEscalate,
        message: shouldEscalate ? 
          'Email escalated for human review' : 
          'Automated response sent successfully',
        responseId: savedResponse.id,
        confidence: aiResponse.confidence
      };

    } catch (error) {
      console.error('Error processing email:', error);
      return {
        success: false,
        escalated: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Load historical responses into database only (simplified version)
   */
  async loadHistoricalResponsesSimple(responses: Array<{
    id: string;
    query: string;
    response: string;
    category: string;
    createdAt: string;
  }>): Promise<void> {
    try {
      // Save to database only - use upsert to handle duplicates
      for (const response of responses) {
        await this.prisma.historicalResponse.upsert({
          where: { id: response.id },
          create: {
            id: response.id,
            customerQuery: response.query,
            response: response.response,
            category: response.category,
            createdAt: new Date(response.createdAt)
          },
          update: {
            customerQuery: response.query,
            response: response.response,
            category: response.category,
          }
        });
      }

      console.log(`Saved ${responses.length} historical responses to database`);
    } catch (error) {
      console.error('Error loading historical responses:', error);
      throw new Error('Failed to load historical responses');
    }
  }

  /**
   * Load historical responses into the RAG system
   */
  async loadHistoricalResponses(responses: Array<{
    id: string;
    query: string;
    response: string;
    category: string;
    createdAt: string;
  }>): Promise<void> {
    try {
      // Save to database - use upsert to handle duplicates
      for (const response of responses) {
        await this.prisma.historicalResponse.upsert({
          where: { id: response.id },
          create: {
            id: response.id,
            customerQuery: response.query,
            response: response.response,
            category: response.category,
            createdAt: new Date(response.createdAt)
          },
          update: {
            customerQuery: response.query,
            response: response.response,
            category: response.category,
          }
        });
      }

      // Add to RAG system
      await this.ragService.addHistoricalResponses(responses);
    } catch (error) {
      console.error('Error loading historical responses:', error);
      throw new Error('Failed to load historical responses');
    }
  }

  /**
   * Get conversation history for admin dashboard
   */
  async getConversationHistory(limit: number = 50): Promise<ConversationWithDetails[]> {
    return await this.prisma.conversation.findMany({
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        emails: {
          orderBy: { receivedAt: 'desc' },
          take: 5
        },
        responses: {
          orderBy: { createdAt: 'desc' },
          take: 3
        }
      }
    });
  }

  /**
   * Get escalated conversations that need human attention
   */
  async getEscalatedConversations(): Promise<ConversationWithDetails[]> {
    return await this.prisma.conversation.findMany({
      where: { status: 'ESCALATED' },
      orderBy: { updatedAt: 'desc' },
      include: {
        emails: {
          orderBy: { receivedAt: 'desc' },
          take: 5
        },
        responses: {
          orderBy: { createdAt: 'desc' },
          take: 3
        }
      }
    });
  }

  /**
   * Determine priority based on query category and content
   */
  private determinePriority(category: QueryCategory, content: string): 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' {
    const urgentKeywords = ['urgent', 'asap', 'immediately', 'broken', 'damaged', 'wrong', 'missing'];
    const highKeywords = ['return', 'refund', 'complaint', 'problem', 'issue'];

    const lowerContent = content.toLowerCase();

    if (urgentKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'URGENT';
    }

    if (category === 'PRODUCT_ISSUE' || highKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'HIGH';
    }

    if (category === 'RETURN_REFUND') {
      return 'HIGH';
    }

    return 'NORMAL';
  }
}

export interface ProcessedEmailResults {
  totalProcessed: number;
  successful: number;
  escalated: number;
  failed: number;
  errors: Array<{
    emailId: string;
    error: string;
  }>;
}

export interface EmailProcessResult {
  success: boolean;
  escalated: boolean;
  message?: string;
  error?: string;
  responseId?: string;
  confidence?: number;
}

export interface ConversationWithDetails {
  id: string;
  customerEmail: string;
  customerName: string | null;
  shopifyOrderId: string | null;
  status: string;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
  emails: Array<{
    id: string;
    subject: string;
    fromEmail: string;
    fromName: string | null;
    body: string;
    receivedAt: Date;
    processed: boolean;
  }>;
  responses: Array<{
    id: string;
    responseText: string;
    confidence: number;
    sentViaGmail: boolean;
    humanReviewed: boolean;
    escalated: boolean;
    createdAt: Date;
    sentAt: Date | null;
  }>;
} 