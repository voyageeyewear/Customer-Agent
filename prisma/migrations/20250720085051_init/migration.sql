-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false
);

-- CreateTable
CREATE TABLE "CustomerEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gmailMessageId" TEXT NOT NULL,
    "threadId" TEXT,
    "subject" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "body" TEXT NOT NULL,
    "htmlBody" TEXT,
    "receivedAt" DATETIME NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "conversationId" TEXT NOT NULL,
    CONSTRAINT "CustomerEmail_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT,
    "shopifyOrderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AIResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "responseText" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "sentViaGmail" BOOLEAN NOT NULL DEFAULT false,
    "humanReviewed" BOOLEAN NOT NULL DEFAULT false,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "conversationId" TEXT NOT NULL,
    "shopifyData" TEXT,
    "ragSources" TEXT,
    "promptUsed" TEXT,
    CONSTRAINT "AIResponse_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HistoricalResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerQuery" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "category" TEXT,
    "embedding" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "gmailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gmailCredentials" TEXT,
    "openaiApiKey" TEXT,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "confidenceThreshold" REAL NOT NULL DEFAULT 0.7,
    "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerEmail_gmailMessageId_key" ON "CustomerEmail"("gmailMessageId");

-- CreateIndex
CREATE INDEX "CustomerEmail_gmailMessageId_idx" ON "CustomerEmail"("gmailMessageId");

-- CreateIndex
CREATE INDEX "CustomerEmail_fromEmail_idx" ON "CustomerEmail"("fromEmail");

-- CreateIndex
CREATE INDEX "CustomerEmail_processed_idx" ON "CustomerEmail"("processed");

-- CreateIndex
CREATE INDEX "Conversation_customerEmail_idx" ON "Conversation"("customerEmail");

-- CreateIndex
CREATE INDEX "Conversation_shopifyOrderId_idx" ON "Conversation"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "Conversation_status_idx" ON "Conversation"("status");

-- CreateIndex
CREATE INDEX "AIResponse_conversationId_idx" ON "AIResponse"("conversationId");

-- CreateIndex
CREATE INDEX "AIResponse_confidence_idx" ON "AIResponse"("confidence");

-- CreateIndex
CREATE INDEX "AIResponse_sentViaGmail_idx" ON "AIResponse"("sentViaGmail");

-- CreateIndex
CREATE INDEX "HistoricalResponse_category_idx" ON "HistoricalResponse"("category");

-- CreateIndex
CREATE UNIQUE INDEX "AppConfig_shop_key" ON "AppConfig"("shop");

-- CreateIndex
CREATE INDEX "AppConfig_shop_idx" ON "AppConfig"("shop");
