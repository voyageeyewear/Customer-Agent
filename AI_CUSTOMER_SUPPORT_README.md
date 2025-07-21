# AI-Powered Customer Support Agent for Eyewear E-commerce

This system provides a fully automated AI-powered customer support agent that handles customer queries via Gmail, integrates with Shopify for order data, and uses advanced AI techniques to generate human-like responses.

## 🚀 Features

### Core Functionality
- **Gmail Integration**: Automatically reads unread customer emails
- **Shopify Orders API**: Fetches real-time order details by customer email or order number
- **RAG System**: Retrieves similar historical responses using ChromaDB and OpenAI embeddings
- **AI Response Generation**: Uses GPT-4o to generate contextual, human-like responses
- **Automated Email Replies**: Sends responses via Gmail API or escalates to human review
- **Admin Dashboard**: Web interface to monitor conversations and manage the system

### Intelligent Features
- **Query Classification**: Automatically categorizes customer inquiries
- **Order Number Extraction**: Detects order references in customer messages
- **Confidence Scoring**: Evaluates response quality before sending
- **Automatic Escalation**: Routes complex issues to human support
- **Priority Assignment**: Assigns urgency levels based on content analysis

## 🏗️ System Architecture

### Components

1. **Gmail Service** (`app/services/gmail.server.ts`)
   - Fetches unread emails from Gmail inbox
   - Sends automated replies
   - Creates drafts for human review
   - Manages email threading

2. **Shopify Orders Service** (`app/services/shopify-orders.server.ts`)
   - Queries Shopify Admin API for customer orders
   - Extracts order numbers from customer messages
   - Provides order status, tracking, and fulfillment data

3. **RAG Service** (`app/services/rag.server.ts`)
   - Uses ChromaDB for vector similarity search
   - Stores and retrieves historical customer support responses
   - Provides context for AI response generation
   - Classifies customer queries into categories

4. **AI Response Service** (`app/services/ai-response.server.ts`)
   - Integrates with OpenAI GPT-4o
   - Generates contextual responses using order data and similar responses
   - Validates response quality
   - Calculates confidence scores

5. **Customer Support Orchestrator** (`app/services/customer-support.server.ts`)
   - Coordinates all services
   - Manages the complete email processing workflow
   - Handles database operations
   - Implements business logic for escalation

### Database Schema

The system uses Prisma with the following key models:

- **CustomerEmail**: Stores incoming customer emails
- **Conversation**: Groups emails by customer
- **AIResponse**: Tracks generated and sent responses
- **HistoricalResponse**: Stores training data for RAG system
- **AppConfig**: Configuration settings per shop

## 📧 Email Processing Workflow

1. **Email Ingestion**: Fetch unread emails from Gmail
2. **Deduplication**: Check if email already processed
3. **Conversation Management**: Find or create customer conversation
4. **Order Lookup**: Search Shopify for relevant order data
5. **Query Analysis**: Classify and extract key information
6. **RAG Retrieval**: Find similar historical responses
7. **AI Generation**: Create contextual response using GPT-4o
8. **Quality Validation**: Check response quality and confidence
9. **Response Handling**: Send reply or escalate to human review
10. **Database Updates**: Track all activities and responses

## 🎯 Query Categories

The system automatically classifies customer queries into:

- **ORDER_STATUS**: Questions about order progress, shipping, delivery
- **RETURN_REFUND**: Return requests, refund inquiries, exchanges
- **PRODUCT_ISSUE**: Damaged, defective, or incorrect products
- **TRACKING**: Tracking number and shipment information requests
- **GENERAL**: Compliments, general questions, feedback
- **OTHER**: Uncategorized queries

## 🔧 Configuration

### Required Environment Variables

```env
# Shopify Configuration
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://your-app-url.com
SCOPES=write_products,read_orders,read_customers,read_fulfillments,read_shipping

# AI Configuration
OPENAI_API_KEY=sk-your-openai-api-key

# Gmail API Configuration
GMAIL_CLIENT_ID=your-gmail-client-id.googleusercontent.com
GMAIL_CLIENT_SECRET=your-gmail-client-secret
GMAIL_REDIRECT_URI=https://your-app-url.com/auth/gmail/callback
GMAIL_REFRESH_TOKEN=your-gmail-refresh-token

# ChromaDB Configuration
CHROMADB_URL=http://localhost:8000
CHROMADB_COLLECTION_NAME=customer_support_responses

# Security
ENCRYPTION_KEY=your-32-character-encryption-key
```

### Dependencies Added

The system requires these additional packages:

```json
{
  "dependencies": {
    "chromadb": "^1.8.1",
    "googleapis": "^142.0.0",
    "openai": "^4.72.1",
    "mailparser": "^3.7.1",
    "nodemailer": "^6.9.14",
    "cheerio": "^1.0.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@types/cheerio": "^0.22.35",
    "@types/mailparser": "^3.4.4",
    "@types/nodemailer": "^6.4.16",
    "@types/uuid": "^10.0.0"
  }
}
```

## 📊 Admin Dashboard

Access the admin dashboard at `/app/customer-support` to:

- View all customer conversations
- Monitor escalated issues requiring human attention
- Process new emails manually
- Review AI response quality and confidence scores
- Track system performance metrics

### Dashboard Features

- **Real-time Statistics**: Total conversations, escalation rates, active/resolved counts
- **Conversation Management**: View detailed conversation histories
- **Email Processing**: Manual trigger for processing unread emails
- **Escalation Queue**: Priority view of conversations needing human review
- **Response Analysis**: Confidence scores and reasoning for AI decisions

## 🤖 AI Response Quality

### Confidence Scoring

The system calculates confidence scores based on:

- Availability of order data (+ 30%)
- Quality of similar historical responses (+ up to 20%)
- Response length and completeness
- Absence of placeholders or incomplete information
- Presence of specific details (tracking numbers, order IDs)

### Escalation Triggers

Conversations are escalated when:

- AI confidence score < 70%
- Response validation fails
- Complex issues detected (urgent keywords)
- Order information cannot be found
- Customer expresses high urgency or dissatisfaction

## 🔄 RAG System

### Historical Response Management

- Automatically loads sample responses on first run
- Stores successful responses for future reference
- Uses semantic similarity search for context retrieval
- Supports manual curation of response templates

### Embedding Strategy

- Uses OpenAI `text-embedding-3-small` for cost efficiency
- Combines customer query and response for comprehensive context
- Filters results by similarity threshold (>50%)
- Provides similarity scores for transparency

## 🚀 Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Up Environment Variables**
   - Copy environment variables from the configuration section
   - Configure Gmail API credentials
   - Set up Shopify app permissions

3. **Initialize Database**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Start ChromaDB**
   ```bash
   # Run ChromaDB locally or use hosted service
   chroma run --host localhost --port 8000
   ```

5. **Initialize the System**
   - Visit `/app/customer-support` in your Shopify app
   - Click "Initialize System" to set up RAG database
   - Configure Gmail authentication

6. **Process Emails**
   - Click "Process New Emails" to handle incoming customer queries
   - Monitor results in the dashboard

## 📈 Performance Monitoring

### Key Metrics

- **Response Time**: Average time to generate and send responses
- **Confidence Distribution**: Quality of AI-generated responses
- **Escalation Rate**: Percentage of queries requiring human review
- **Customer Satisfaction**: Track through response quality scores

### Optimization Tips

- Regularly update historical responses with successful interactions
- Monitor escalation patterns to improve AI training
- Adjust confidence thresholds based on performance
- Use customer feedback to refine response templates

## 🔒 Security & Privacy

- All API keys are stored as environment variables
- Customer data is encrypted in the database
- Gmail access uses OAuth2 with secure token refresh
- Response generation logs exclude sensitive information
- Compliance with data protection regulations

## 🛠️ Troubleshooting

### Common Issues

1. **Gmail API Errors**: Check OAuth credentials and token refresh
2. **Shopify API Limits**: Implement rate limiting and error handling
3. **ChromaDB Connection**: Verify service is running and accessible
4. **OpenAI Rate Limits**: Monitor usage and implement backoff strategies

### Debug Mode

Enable detailed logging by setting:
```env
NODE_ENV=development
```

## 🚀 Future Enhancements

### Phase 2 Features
- WhatsApp integration via Interakt/Zoko
- Advanced customer tagging (VIP, new buyer)
- Return/refund status integration
- Courier API integration for real-time tracking
- Live chat widget for website
- Shopify webhook notifications for shipping updates

### Advanced AI Features
- Multi-language support
- Sentiment analysis for customer satisfaction
- Predictive escalation based on conversation patterns
- Automated follow-up suggestions
- Integration with knowledge base articles

---

## 📞 Support

For questions or issues with the AI Customer Support Agent system, please refer to the implementation documentation or contact the development team.

**Built with ❤️ for premium eyewear customer experience** 