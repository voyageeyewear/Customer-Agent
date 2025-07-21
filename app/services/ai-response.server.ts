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
    const { customerName, orderData, customerQuery } = params;
    
    let fallbackResponse = '';
    let reasoning = '';
    
    // Customize fallback based on error type
    switch (errorType) {
      case 'rate_limit':
        reasoning = 'AI service rate limited - generated fallback response';
        break;
      case 'auth_error':
        reasoning = 'AI service authentication error - generated fallback response';
        break;
      case 'service_unavailable':
        reasoning = 'AI service temporarily unavailable - generated fallback response';
        break;
      case 'network_error':
        reasoning = 'Network connection issue - generated fallback response';
        break;
      case 'context_too_long':
        reasoning = 'Request too complex for AI - generated fallback response';
        break;
      case 'invalid_request':
        reasoning = 'Invalid AI request format - generated fallback response';
        break;
      default:
        reasoning = 'AI service unavailable - generated fallback response';
    }
    
    // Try to provide a contextual fallback based on available data
    if (orderData && orderData.length > 0) {
      const latestOrder = orderData[0];
      fallbackResponse = `Thank you${customerName ? ` ${customerName}` : ''} for contacting us regarding your inquiry. I can see you have order #${latestOrder.orderNumber} with a status of "${latestOrder.fulfillmentStatus}". Our customer service team is currently reviewing your message and will provide you with a detailed response within 2-4 hours. If this is urgent, please call our customer service line. We appreciate your patience and are committed to helping you.`;
    } else {
      // Generic fallback when no order data is available
      fallbackResponse = `Thank you${customerName ? ` ${customerName}` : ''} for reaching out to us. Our customer service team is currently reviewing your inquiry and will get back to you within 2-4 hours with a detailed response. If this is urgent, please don't hesitate to call our customer service line. We appreciate your patience and are committed to resolving your question promptly.`;
    }

    return {
      response: fallbackResponse,
      confidence: 0.6, // Moderate confidence for fallback
      reasoning: reasoning + (orderData && orderData.length > 0 ? ' using available order data' : ''),
      shouldEscalate: true, // Always escalate fallback responses
      promptUsed: `Fallback response - AI service error: ${errorType}`,
      modelUsed: 'fallback',
      tokensUsed: 0,
    };
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