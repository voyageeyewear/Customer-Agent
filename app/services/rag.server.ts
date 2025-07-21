import { ChromaClient, OpenAIEmbeddingFunction } from 'chromadb';
import OpenAI from 'openai';

export class RAGService {
  private chromaClient: ChromaClient;
  private openai: OpenAI;
  private collectionName: string;
  private embeddingFunction: OpenAIEmbeddingFunction;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    this.chromaClient = new ChromaClient({
      path: process.env.CHROMADB_URL || 'http://localhost:8000',
    });

    this.collectionName = process.env.CHROMADB_COLLECTION_NAME || 'customer_support_responses';
    
    this.embeddingFunction = new OpenAIEmbeddingFunction({
      openai_api_key: process.env.OPENAI_API_KEY!,
      openai_model: 'text-embedding-3-small',
    });
  }

  /**
   * Initialize the RAG system and create collection if needed
   */
  async initialize(): Promise<void> {
    try {
      // Try to get existing collection
      await this.chromaClient.getCollection({
        name: this.collectionName,
        embeddingFunction: this.embeddingFunction,
      });
    } catch (error) {
      // Collection doesn't exist, create it
      await this.chromaClient.createCollection({
        name: this.collectionName,
        embeddingFunction: this.embeddingFunction,
        metadata: {
          description: 'Customer support responses for eyewear e-commerce',
          created_at: new Date().toISOString(),
        },
      });
    }
  }

  /**
   * Add historical responses to the RAG system
   */
  async addHistoricalResponses(responses: HistoricalResponse[]): Promise<void> {
    try {
      const collection = await this.chromaClient.getCollection({
        name: this.collectionName,
        embeddingFunction: this.embeddingFunction,
      });

      const documents = responses.map(r => `Query: ${r.query}\nResponse: ${r.response}`);
      const metadatas = responses.map(r => ({
        id: r.id,
        category: r.category,
        query: r.query,
        response: r.response,
        created_at: r.createdAt,
      }));
      const ids = responses.map(r => r.id);

      await collection.add({
        documents,
        metadatas,
        ids,
      });

      console.log(`Added ${responses.length} historical responses to RAG system`);
    } catch (error) {
      console.error('Error adding historical responses:', error);
      throw new Error('Failed to add historical responses to RAG system');
    }
  }

  /**
   * Search for similar responses based on customer query
   */
  async searchSimilarResponses(
    customerQuery: string,
    numResults: number = 3
  ): Promise<SimilarResponse[]> {
    try {
      const collection = await this.chromaClient.getCollection({
        name: this.collectionName,
        embeddingFunction: this.embeddingFunction,
      });

      const results = await collection.query({
        queryTexts: [customerQuery],
        nResults: numResults,
      });

      const similarResponses: SimilarResponse[] = [];

      if (results.documents && results.metadatas && results.distances) {
        for (let i = 0; i < results.documents[0].length; i++) {
          const metadata = results.metadatas[0][i] as any;
          const distance = results.distances[0][i];
          const similarity = 1 - distance; // Convert distance to similarity

          similarResponses.push({
            id: metadata.id,
            category: metadata.category,
            query: metadata.query,
            response: metadata.response,
            similarity,
            createdAt: metadata.created_at,
          });
        }
      }

      return similarResponses.filter(r => r.similarity > 0.5); // Filter low similarity responses
    } catch (error: any) {
      console.error('Error searching similar responses:', error);
      
      // Handle specific OpenAI errors gracefully for embedding generation
      if (error?.status === 429 || error?.code === 'insufficient_quota' || error?.code === 'rate_limit_exceeded') {
        console.log('OpenAI quota/rate limit exceeded during similarity search - returning empty results');
        return [];
      }
      
      if (error?.status === 401 || error?.code === 'invalid_api_key') {
        console.log('OpenAI authentication error during similarity search - returning empty results');
        return [];
      }
      
      if (error?.status === 503 || error?.status === 502 || error?.code === 'service_unavailable') {
        console.log('OpenAI service unavailable during similarity search - returning empty results');
        return [];
      }
      
      // Handle network/connection errors
      if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'ETIMEDOUT') {
        console.log('Network connection error during similarity search - returning empty results');
        return [];
      }
      
      // For any other errors, return empty array to continue processing
      console.log('Unknown error during similarity search - returning empty results');
      return [];
    }
  }

  /**
   * Classify customer query into categories
   */
  async classifyQuery(query: string): Promise<QueryCategory> {
    try {
      const prompt = `
        Classify the following customer query into one of these categories:
        - ORDER_STATUS: Questions about order status, shipping, delivery
        - RETURN_REFUND: Questions about returns, refunds, exchanges
        - PRODUCT_ISSUE: Reports of damaged, defective, or wrong products
        - TRACKING: Requests for tracking information
        - GENERAL: General questions, compliments, complaints
        - OTHER: Anything that doesn't fit above categories

        Customer query: "${query}"

        Respond with only the category name (e.g., ORDER_STATUS).
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 20,
        temperature: 0,
      });

      const category = response.choices[0]?.message?.content?.trim().toUpperCase() || 'OTHER';
      
      // Validate category
      const validCategories = ['ORDER_STATUS', 'RETURN_REFUND', 'PRODUCT_ISSUE', 'TRACKING', 'GENERAL', 'OTHER'];
      return validCategories.includes(category) ? category as QueryCategory : 'OTHER';
    } catch (error) {
      console.error('Error classifying query:', error);
      return 'OTHER';
    }
  }

  /**
   * Extract key information from customer query
   */
  async extractQueryInfo(query: string): Promise<QueryInfo> {
    try {
      const prompt = `
        Extract the following information from this customer query:
        - Order number (if mentioned)
        - Email address (if mentioned)
        - Phone number (if mentioned)
        - Product name (if mentioned)
        - Issue type (damaged, missing, wrong item, etc.)

        Customer query: "${query}"

        Respond in JSON format:
        {
          "orderNumber": "extracted order number or null",
          "email": "extracted email or null",
          "phone": "extracted phone or null",
          "productName": "extracted product name or null",
          "issueType": "extracted issue type or null"
        }
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0,
      });

      const result = response.choices[0]?.message?.content?.trim();
      if (result) {
        try {
          return JSON.parse(result);
        } catch {
          // Fallback if JSON parsing fails
        }
      }

      return {
        orderNumber: null,
        email: null,
        phone: null,
        productName: null,
        issueType: null,
      };
    } catch (error) {
      console.error('Error extracting query info:', error);
      return {
        orderNumber: null,
        email: null,
        phone: null,
        productName: null,
        issueType: null,
      };
    }
  }

  /**
   * Load sample historical responses for initial setup
   */
  static getSampleHistoricalResponses(): HistoricalResponse[] {
    return [
      {
        id: 'sample-1',
        query: 'Where is my order? I ordered glasses last week.',
        response: 'Thank you for contacting us! I can help you track your order. Your glasses order is currently being processed and will be shipped within 2-3 business days. You will receive a tracking email once your order ships. If you have any other questions, please feel free to reach out!',
        category: 'ORDER_STATUS',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'sample-2',
        query: 'My glasses arrived broken. What should I do?',
        response: 'I\'m so sorry to hear that your glasses arrived damaged! We want to make this right immediately. Please send us photos of the damage to our support email, and we\'ll send you a replacement pair right away at no cost. We\'ll also include a prepaid return label for the damaged glasses.',
        category: 'PRODUCT_ISSUE',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'sample-3',
        query: 'How can I return my glasses? They don\'t fit properly.',
        response: 'We offer a 30-day return policy for all our eyewear. Since the fit isn\'t right, we can either help you exchange for a different size or provide a full refund. I\'ll email you a prepaid return label and detailed instructions. Would you prefer an exchange or refund?',
        category: 'RETURN_REFUND',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'sample-4',
        query: 'Can you give me the tracking number for my order?',
        response: 'I\'d be happy to provide your tracking information! Your order was shipped via [Carrier] and your tracking number is [TRACKING_NUMBER]. You can track your package at [TRACKING_URL]. Your estimated delivery date is [DELIVERY_DATE].',
        category: 'TRACKING',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'sample-5',
        query: 'I love my new glasses! Thank you so much!',
        response: 'Thank you so much for the wonderful feedback! We\'re thrilled that you love your new glasses. Your satisfaction is our top priority, and it means the world to us to hear that we\'ve exceeded your expectations. Enjoy your new eyewear!',
        category: 'GENERAL',
        createdAt: new Date().toISOString(),
      },
    ];
  }
}

export interface HistoricalResponse {
  id: string;
  query: string;
  response: string;
  category: string;
  createdAt: string;
}

export interface SimilarResponse {
  id: string;
  category: string;
  query: string;
  response: string;
  similarity: number;
  createdAt: string;
}

export interface QueryInfo {
  orderNumber: string | null;
  email: string | null;
  phone: string | null;
  productName: string | null;
  issueType: string | null;
}

export type QueryCategory = 
  | 'ORDER_STATUS'
  | 'RETURN_REFUND'
  | 'PRODUCT_ISSUE'
  | 'TRACKING'
  | 'GENERAL'
  | 'OTHER'; 