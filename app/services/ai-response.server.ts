import OpenAI from 'openai';
import type { ShopifyOrder } from './shopify-orders.server';
import type { SimilarResponse } from './rag.server';

export class AIResponseService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
  }

  /**
   * Generate AI response for customer support query
   */
  async generateResponse(params: {
    customerQuery: string;
    customerEmail: string;
    customerName?: string;
    orderData?: ShopifyOrder[];
    similarResponses?: SimilarResponse[];
    category?: string;
    context?: string;
  }): Promise<AIGeneratedResponse> {
    try {
      const {
        customerQuery,
        customerEmail,
        customerName,
        orderData,
        similarResponses,
        category,
        context
      } = params;

      const prompt = this.buildPrompt({
        customerQuery,
        customerEmail,
        customerName,
        orderData,
        similarResponses,
        category,
        context
      });

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const responseText = response.choices[0]?.message?.content?.trim() || '';
      const confidence = this.calculateConfidence(responseText, orderData, similarResponses);

      return {
        response: responseText,
        confidence,
        reasoning: this.extractReasoning(responseText, orderData, similarResponses),
        shouldEscalate: confidence < 0.7,
        promptUsed: prompt,
        modelUsed: 'gpt-4o',
        tokensUsed: response.usage?.total_tokens || 0,
      };
    } catch (error: any) {
      console.error('Error generating AI response:', error);
      
      // Handle specific OpenAI error types with appropriate responses
      if (error?.status === 429 || error?.code === 'insufficient_quota' || error?.code === 'rate_limit_exceeded') {
        console.log('OpenAI rate limit/quota exceeded, providing fallback response');
        return this.generateFallbackResponse(params, 'rate_limit');
      }
      
      if (error?.status === 401 || error?.code === 'invalid_api_key') {
        console.log('OpenAI authentication error, providing fallback response');
        return this.generateFallbackResponse(params, 'auth_error');
      }
      
      if (error?.status === 503 || error?.status === 502 || error?.code === 'service_unavailable') {
        console.log('OpenAI service unavailable, providing fallback response');
        return this.generateFallbackResponse(params, 'service_unavailable');
      }
      
      if (error?.status === 400 || error?.code === 'invalid_request_error') {
        console.log('OpenAI invalid request, providing fallback response');
        return this.generateFallbackResponse(params, 'invalid_request');
      }
      
      if (error?.code === 'context_length_exceeded') {
        console.log('OpenAI context length exceeded, providing fallback response');
        return this.generateFallbackResponse(params, 'context_too_long');
      }
      
      // Handle network/connection errors
      if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'ETIMEDOUT') {
        console.log('Network connection error, providing fallback response');
        return this.generateFallbackResponse(params, 'network_error');
      }
      
      // For any other errors, still provide a fallback instead of throwing
      console.log('Unknown OpenAI error, providing fallback response');
      return this.generateFallbackResponse(params, 'unknown_error');
    }
  }

  /**
   * Generate a fallback response when AI is unavailable
   */
  private generateFallbackResponse(params: {
    customerQuery: string;
    customerEmail: string;
    customerName?: string;
    orderData?: ShopifyOrder[];
    similarResponses?: SimilarResponse[];
    category?: string;
    context?: string;
  }, errorType: string = 'unknown'): AIGeneratedResponse {
    const { customerName, orderData, customerQuery, customerEmail } = params;
    
    // Analyze the customer query to determine intent
    const queryAnalysis = this.analyzeCustomerQuery(customerQuery);
    
    let fallbackResponse = '';
    let confidence = 0.6;
    
    // Generate contextual response based on query analysis
    switch (queryAnalysis.intent) {
      case 'order_status':
        fallbackResponse = this.generateOrderStatusResponse(customerName, customerQuery, orderData, queryAnalysis);
        confidence = 0.75;
        break;
        
      case 'shipping_tracking':
        fallbackResponse = this.generateShippingResponse(customerName, customerQuery, orderData, queryAnalysis);
        confidence = 0.75;
        break;
        
      case 'return_refund':
        fallbackResponse = this.generateReturnRefundResponse(customerName, customerQuery, orderData, queryAnalysis);
        confidence = 0.7;
        break;
        
      case 'product_inquiry':
        fallbackResponse = this.generateProductInquiryResponse(customerName, customerQuery, orderData, queryAnalysis);
        confidence = 0.65;
        break;
        
      case 'complaint_issue':
        fallbackResponse = this.generateComplaintResponse(customerName, customerQuery, orderData, queryAnalysis);
        confidence = 0.8; // High confidence - need immediate attention
        break;
        
      case 'general_inquiry':
      default:
        fallbackResponse = this.generateGeneralResponse(customerName, customerQuery, orderData, queryAnalysis);
        confidence = 0.6;
        break;
    }

    const reasoning = `Intelligent fallback response (${errorType}) - detected intent: ${queryAnalysis.intent}, keywords: ${queryAnalysis.keywords.join(', ')}`;

    return {
      response: fallbackResponse,
      confidence,
      reasoning: reasoning + (orderData && orderData.length > 0 ? ' with order data' : ''),
      shouldEscalate: queryAnalysis.requiresEscalation || confidence < 0.7,
      promptUsed: `Smart fallback analysis - Intent: ${queryAnalysis.intent}`,
      modelUsed: 'intelligent_fallback',
      tokensUsed: 0,
    };
  }

  /**
   * Analyze customer query to determine intent and extract key information
   */
  private analyzeCustomerQuery(query: string): {
    intent: string;
    keywords: string[];
    orderNumber?: string;
    urgency: 'low' | 'medium' | 'high';
    requiresEscalation: boolean;
  } {
    const lowerQuery = query.toLowerCase();
    const keywords: string[] = [];
    let intent = 'general_inquiry';
    let urgency: 'low' | 'medium' | 'high' = 'medium';
    let requiresEscalation = false;

    // Extract order number if present
    const orderMatch = query.match(/(?:order|#)\s*([A-Z0-9-]+)/i);
    const orderNumber = orderMatch ? orderMatch[1] : undefined;

    // Order status related keywords
    if (lowerQuery.match(/\b(status|where|when|delivered|arrive|shipped|shipping|delivery|tracking|track)\b/)) {
      keywords.push('status', 'shipping');
      if (lowerQuery.match(/\b(track|tracking|number)\b/)) {
        intent = 'shipping_tracking';
      } else {
        intent = 'order_status';
      }
    }

    // Return and refund keywords
    if (lowerQuery.match(/\b(return|refund|exchange|cancel|defective|wrong|broken|damaged)\b/)) {
      keywords.push('return', 'refund');
      intent = 'return_refund';
      requiresEscalation = true;
    }

    // Product inquiry keywords
    if (lowerQuery.match(/\b(blue light|prescription|lens|frame|size|fit|color|style|recommend)\b/)) {
      keywords.push('product');
      intent = 'product_inquiry';
    }

    // Complaint/issue keywords
    if (lowerQuery.match(/\b(problem|issue|complaint|disappointed|unhappy|terrible|awful|angry|frustrated)\b/)) {
      keywords.push('complaint');
      intent = 'complaint_issue';
      urgency = 'high';
      requiresEscalation = true;
    }

    // Urgency indicators
    if (lowerQuery.match(/\b(urgent|asap|immediately|emergency|help|please help)\b/)) {
      urgency = 'high';
      requiresEscalation = true;
    }

    return {
      intent,
      keywords,
      orderNumber,
      urgency,
      requiresEscalation
    };
  }

  /**
   * Generate order status response
   */
  private generateOrderStatusResponse(customerName: string | undefined, query: string, orderData: ShopifyOrder[] | undefined, analysis: any): string {
    const name = customerName ? ` ${customerName}` : '';
    
    if (orderData && orderData.length > 0) {
      const order = orderData[0];
      return `Hi${name}, thank you for your inquiry about your order. I can see you have order #${order.orderNumber} with a ${order.fulfillmentStatus} status. ${this.getOrderStatusDetails(order)} Our team will provide you with any additional updates you need. If you have any other questions, please let us know!`;
    } else if (analysis.orderNumber) {
      return `Hi${name}, thank you for asking about order #${analysis.orderNumber}. I'm looking up the details for this order and will get back to you within 30 minutes with a complete status update. If this is urgent, please call our customer service line at your convenience.`;
    } else {
      return `Hi${name}, thank you for your order status inquiry. To provide you with accurate information, I'll need to look up your order details. Could you please provide your order number? Alternatively, our customer service team can help you immediately by phone.`;
    }
  }

  /**
   * Generate shipping/tracking response
   */
  private generateShippingResponse(customerName: string | undefined, query: string, orderData: ShopifyOrder[] | undefined, analysis: any): string {
    const name = customerName ? ` ${customerName}` : '';
    
    if (orderData && orderData.length > 0) {
      const order = orderData[0];
      if (order.fulfillments && order.fulfillments.length > 0) {
        const fulfillment = order.fulfillments[0];
        const tracking = fulfillment.trackingNumbers?.[0];
        return `Hi${name}, your order #${order.orderNumber} has shipped! ${tracking ? `Your tracking number is ${tracking} with ${fulfillment.trackingCompany}.` : 'You should receive tracking information shortly.'} ${fulfillment.estimatedDeliveryAt ? `Expected delivery: ${new Date(fulfillment.estimatedDeliveryAt).toLocaleDateString()}.` : ''} You can track your package directly on the carrier's website.`;
      } else {
        return `Hi${name}, your order #${order.orderNumber} is currently being prepared for shipment. You'll receive tracking information as soon as it ships, typically within 1-2 business days. Thank you for your patience!`;
      }
    } else {
      return `Hi${name}, I'd be happy to help you track your order! Could you please provide your order number so I can give you the most up-to-date tracking information? Our customer service team is also available to assist you immediately.`;
    }
  }

  /**
   * Generate return/refund response
   */
  private generateReturnRefundResponse(customerName: string | undefined, query: string, orderData: ShopifyOrder[] | undefined, analysis: any): string {
    const name = customerName ? ` ${customerName}` : '';
    
    return `Hi${name}, I understand you'd like to discuss a return or refund. We offer a 30-day return policy and want to make this process as easy as possible for you. Our customer service team will review your specific situation and provide you with return instructions and a prepaid shipping label if needed. You'll hear back from us within 2 hours, or feel free to call our customer service line for immediate assistance.`;
  }

  /**
   * Generate product inquiry response
   */
  private generateProductInquiryResponse(customerName: string | undefined, query: string, orderData: ShopifyOrder[] | undefined, analysis: any): string {
    const name = customerName ? ` ${customerName}` : '';
    
    let productSpecific = '';
    if (query.toLowerCase().includes('blue light')) {
      productSpecific = ' Our blue light glasses filter 90% of harmful blue light and can significantly reduce eye strain from digital screens.';
    } else if (query.toLowerCase().includes('prescription')) {
      productSpecific = ' We work with licensed opticians to ensure your prescription is perfectly crafted for your new frames.';
    }
    
    return `Hi${name}, thank you for your interest in our eyewear products!${productSpecific} Our customer service team will provide you with detailed information to help you make the best choice for your needs. You'll receive a comprehensive response within 2-4 hours, or call us for immediate assistance with product selection.`;
  }

  /**
   * Generate complaint/issue response
   */
  private generateComplaintResponse(customerName: string | undefined, query: string, orderData: ShopifyOrder[] | undefined, analysis: any): string {
    const name = customerName ? ` ${customerName}` : '';
    
    return `Hi${name}, I sincerely apologize for any inconvenience you've experienced. Your concern is very important to us, and I want to make sure we resolve this properly. A senior customer service representative will personally review your case and contact you within 1 hour to discuss how we can make this right. If you prefer immediate assistance, please call our customer service line and mention this is a priority case.`;
  }

  /**
   * Generate general response
   */
  private generateGeneralResponse(customerName: string | undefined, query: string, orderData: ShopifyOrder[] | undefined, analysis: any): string {
    const name = customerName ? ` ${customerName}` : '';
    const lowerQuery = query.toLowerCase();
    
    // Provide contextual responses even for general inquiries
    if (lowerQuery.includes('hours') || lowerQuery.includes('open') || lowerQuery.includes('when')) {
      return `Hi${name}, thank you for your inquiry! Our customer service team is available Monday-Friday 9 AM to 6 PM EST. You can also reach us anytime through this email system, and we typically respond within a few hours during business days. How can we help you today?`;
    }
    
    if (lowerQuery.includes('policy') || lowerQuery.includes('return') || lowerQuery.includes('warranty')) {
      return `Hi${name}, thank you for asking about our policies! We offer a 30-day return policy for all our eyewear products. If you're not completely satisfied, you can return items in original condition for a full refund or exchange. Our customer service team can provide detailed policy information and help with any returns. What specific information do you need?`;
    }
    
    if (lowerQuery.includes('prescription') || lowerQuery.includes('glasses') || lowerQuery.includes('lens')) {
      return `Hi${name}, thank you for your interest in our eyewear! We offer both prescription and non-prescription glasses, including blue light blocking lenses. Our team can help you with frame selection, lens options, and prescription requirements. What specific questions do you have about our products?`;
    }
    
    if (lowerQuery.includes('shipping') || lowerQuery.includes('delivery') || lowerQuery.includes('cost')) {
      return `Hi${name}, thank you for your shipping inquiry! We offer free standard shipping on orders over $50, with delivery typically taking 5-7 business days. Expedited shipping options are also available. Our team can provide specific shipping details and costs for your location. What would you like to know?`;
    }
    
    // Default intelligent response that actually addresses the customer
    return `Hi${name}, thank you for reaching out! I've received your message regarding "${query.length > 50 ? query.substring(0, 50) + '...' : query}" and I want to make sure we provide you with the most helpful response. Our customer service team is reviewing your specific question and will get back to you shortly with detailed information. Is there anything urgent I can help you with right now?`;
  }

  /**
   * Get detailed order status information
   */
  private getOrderStatusDetails(order: ShopifyOrder): string {
    switch (order.fulfillmentStatus) {
      case 'shipped':
        return 'Your order has been shipped and is on its way to you!';
      case 'delivered':
        return 'Your order has been delivered.';
      case 'pending':
        return 'Your order is being prepared and will ship soon.';
      case 'processing':
        return 'Your order is currently being processed.';
      default:
        return 'Your order is being handled by our team.';
    }
  }

  /**
   * Build the main prompt for GPT-4o
   */
  private buildPrompt(params: {
    customerQuery: string;
    customerEmail: string;
    customerName?: string;
    orderData?: ShopifyOrder[];
    similarResponses?: SimilarResponse[];
    category?: string;
    context?: string;
  }): string {
    const {
      customerQuery,
      customerEmail,
      customerName,
      orderData,
      similarResponses,
      category,
      context
    } = params;

    let prompt = `
Customer Support Query Analysis:

Customer: ${customerName || customerEmail}
Email: ${customerEmail}
Query Category: ${category || 'Unknown'}

Customer Message:
"${customerQuery}"
`;

    if (context) {
      prompt += `\nAdditional Context:\n${context}\n`;
    }

    if (orderData && orderData.length > 0) {
      prompt += '\nCustomer Order Information:\n';
      orderData.slice(0, 3).forEach((order, index) => {
        prompt += `
Order ${index + 1}:
- Order Number: ${order.orderNumber}
- Status: ${order.fulfillmentStatus}
- Financial Status: ${order.financialStatus}
- Order Date: ${new Date(order.processedAt).toLocaleDateString()}
- Total: ${order.totalPrice}
- Items: ${order.items.map(item => `${item.quantity}x ${item.title}`).join(', ')}
- Shipping Address: ${order.shippingAddress.city}, ${order.shippingAddress.province}, ${order.shippingAddress.country}
`;

        if (order.fulfillments && order.fulfillments.length > 0) {
          const latestFulfillment = order.fulfillments[0];
          prompt += `- Shipping: ${latestFulfillment.trackingCompany || 'Standard Shipping'}`;
          if (latestFulfillment.trackingNumbers && latestFulfillment.trackingNumbers.length > 0) {
            prompt += ` (Tracking: ${latestFulfillment.trackingNumbers[0]})`;
          }
          if (latestFulfillment.estimatedDeliveryAt) {
            prompt += ` - ETA: ${new Date(latestFulfillment.estimatedDeliveryAt).toLocaleDateString()}`;
          }
          prompt += '\n';
        }
      });
    } else {
      prompt += '\nNo order information found for this customer.\n';
    }

    if (similarResponses && similarResponses.length > 0) {
      prompt += '\nSimilar Past Responses (for reference):\n';
      similarResponses.slice(0, 3).forEach((response, index) => {
        prompt += `
Reference ${index + 1} (Similarity: ${(response.similarity * 100).toFixed(1)}%):
Query: "${response.query}"
Response: "${response.response}"
`;
      });
    }

    prompt += `
Instructions:
1. Write a helpful, polite, and professional response to the customer
2. Use the order information to provide specific details when relevant
3. Reference similar past responses for tone and style, but personalize for this specific situation
4. If order information is available, include specific tracking details, delivery estimates, etc.
5. If no order information is found but the customer mentions an order, acknowledge this and offer to help find their order
6. Keep the response concise but complete (2-4 sentences typically)
7. End with a helpful next step or offer of additional assistance
8. Use a warm, human-like tone that reflects our premium eyewear brand

Generate only the response text (no additional formatting or explanations):`;

    return prompt;
  }

  /**
   * Get system prompt for the AI
   */
  private getSystemPrompt(): string {
    return `You are a customer support specialist for a premium eyewear e-commerce brand. Your role is to provide helpful, accurate, and empathetic responses to customer inquiries.

Brand Guidelines:
- We are a premium eyewear brand that values quality and customer satisfaction
- Our tone is professional yet warm and friendly
- We offer excellent customer service including 30-day returns, free exchanges, and prompt replacement for damaged items
- Common shipping carriers: FedEx, UPS, USPS, DHL
- Standard processing time: 1-3 business days
- Standard shipping time: 3-7 business days
- We provide tracking information once orders ship

Key Principles:
1. Always be empathetic and understanding
2. Provide specific, actionable information when possible
3. Take ownership of issues and offer solutions
4. Be proactive in offering additional help
5. Maintain a premium brand image while being approachable
6. Never make promises about timeframes without order data
7. Always acknowledge the customer's concern before providing information

Response Style:
- Start with empathy/acknowledgment
- Provide specific information from order data
- Offer clear next steps
- End with additional assistance offer
- Keep responses concise but complete`;
  }

  /**
   * Calculate confidence score for the response
   */
  private calculateConfidence(
    response: string,
    orderData?: ShopifyOrder[],
    similarResponses?: SimilarResponse[]
  ): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence if we have order data
    if (orderData && orderData.length > 0) {
      confidence += 0.3;
    }

    // Increase confidence if we have similar responses
    if (similarResponses && similarResponses.length > 0) {
      const avgSimilarity = similarResponses.reduce((sum, r) => sum + r.similarity, 0) / similarResponses.length;
      confidence += avgSimilarity * 0.2;
    }

    // Decrease confidence if response is too short or generic
    if (response.length < 50) {
      confidence -= 0.2;
    }

    // Decrease confidence if response contains placeholders
    if (response.includes('[') || response.includes('{{') || response.includes('PLACEHOLDER')) {
      confidence -= 0.3;
    }

    // Increase confidence if response mentions specific details
    if (response.match(/tracking|order.*#\d+|delivery|shipping/i)) {
      confidence += 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Extract reasoning for the response generation
   */
  private extractReasoning(
    response: string,
    orderData?: ShopifyOrder[],
    similarResponses?: SimilarResponse[]
  ): string {
    const reasons = [];

    if (orderData && orderData.length > 0) {
      reasons.push(`Found ${orderData.length} order(s) for customer`);
    } else {
      reasons.push('No order data available');
    }

    if (similarResponses && similarResponses.length > 0) {
      const avgSimilarity = similarResponses.reduce((sum, r) => sum + r.similarity, 0) / similarResponses.length;
      reasons.push(`${similarResponses.length} similar responses found (avg similarity: ${(avgSimilarity * 100).toFixed(1)}%)`);
    }

    if (response.length < 50) {
      reasons.push('Response may be too brief');
    }

    if (response.includes('[') || response.includes('{{')) {
      reasons.push('Response contains placeholders');
    }

    return reasons.join('; ');
  }

  /**
   * Generate a fallback escalation message
   */
  generateEscalationMessage(customerName?: string): string {
    const name = customerName ? ` ${customerName}` : '';
    return `Thank you${name} for reaching out to us. I want to make sure we provide you with the most accurate and helpful information possible. I'm looking into your inquiry and will get back to you within 2-4 hours with a detailed response. If this is urgent, please don't hesitate to call our customer service line. We appreciate your patience and are committed to resolving your question promptly.`;
  }

  /**
   * Validate response quality
   */
  validateResponse(response: string): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check for minimum length
    if (response.length < 30) {
      issues.push('Response is too short');
    }

    // Check for maximum length
    if (response.length > 1000) {
      warnings.push('Response is quite long');
    }

    // Check for placeholders
    if (response.match(/\[.*\]|\{\{.*\}\}|PLACEHOLDER|TODO|XXX/i)) {
      issues.push('Response contains placeholders or incomplete information');
    }

    // Check for professional tone indicators
    const professionalWords = ['thank you', 'appreciate', 'help', 'assist', 'sorry', 'apologize'];
    const hasProffessionalTone = professionalWords.some(word => 
      response.toLowerCase().includes(word)
    );
    if (!hasProffessionalTone) {
      warnings.push('Response may lack professional courtesy words');
    }

    // Check for specific information when it should be present
    if (response.includes('your order') && !response.match(/#\d+|order.*\d+/i)) {
      warnings.push('Response mentions order but lacks specific order details');
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
      score: Math.max(0, 1 - (issues.length * 0.3) - (warnings.length * 0.1))
    };
  }
}

export interface AIGeneratedResponse {
  response: string;
  confidence: number;
  reasoning: string;
  shouldEscalate: boolean;
  promptUsed: string;
  modelUsed: string;
  tokensUsed: number;
}

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  score: number;
} 