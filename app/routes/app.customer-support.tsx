import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useSubmit } from "@remix-run/react";
import {
  Page,
  Card,
  DataTable,
  Badge,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Layout,
  CalloutCard,
  ProgressBar,
  Modal,
  TextField,
  Select,
  Spinner,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { CustomerSupportService } from "../services/customer-support.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  
  try {
    const supportService = new CustomerSupportService(request, prisma);
    
    // Get conversation history
    const conversations = await supportService.getConversationHistory(50);
    
    // Get escalated conversations
    const escalated = await supportService.getEscalatedConversations();
    
    // Get some basic stats
    const stats = {
      totalConversations: conversations.length,
      escalatedCount: escalated.length,
      activeCount: conversations.filter(c => c.status === 'ACTIVE').length,
      resolvedCount: conversations.filter(c => c.status === 'RESOLVED').length,
    };

    return json({
      conversations,
      escalated,
      stats,
      shop: session.shop,
    });
  } catch (error) {
    console.error('Error loading customer support data:', error);
    return json({
      conversations: [],
      escalated: [],
      stats: { totalConversations: 0, escalatedCount: 0, activeCount: 0, resolvedCount: 0 },
      shop: session.shop,
      error: 'Failed to load customer support data',
    } as const);
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  try {
    const supportService = new CustomerSupportService(request, prisma);

    switch (action) {
      case "processEmails":
        await supportService.initialize();
        const results = await supportService.processUnreadEmails();
        return json({ 
          success: true, 
          message: `Processed ${results.totalProcessed} emails. ${results.successful} successful, ${results.escalated} escalated, ${results.failed} failed.`,
          results 
        });

      case "initialize":
        await supportService.initialize();
        return json({ 
          success: true, 
          message: "Customer support system initialized successfully" 
        });

      default:
        return json({ 
          success: false, 
          message: "Unknown action" 
        });
    }
  } catch (error) {
    console.error('Error in customer support action:', error);
    return json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
};

export default function CustomerSupportDashboard() {
  const loaderData = useLoaderData<typeof loader>();
  const { conversations, escalated, stats, shop } = loaderData;
  const error = 'error' in loaderData ? loaderData.error : undefined;
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleProcessEmails = useCallback(async () => {
    setIsProcessing(true);
    const formData = new FormData();
    formData.append("action", "processEmails");
    submit(formData, { method: "post" });
    setTimeout(() => setIsProcessing(false), 5000); // Reset after 5 seconds
  }, [submit]);

  const handleInitialize = useCallback(async () => {
    const formData = new FormData();
    formData.append("action", "initialize");
    submit(formData, { method: "post" });
  }, [submit]);

  // Format conversation data for DataTable
  const conversationRows = conversations.map((conversation) => [
    conversation.customerEmail,
    conversation.customerName || '-',
    conversation.shopifyOrderId || '-',
    <Badge key={conversation.id} tone={getStatusTone(conversation.status)}>
      {conversation.status}
    </Badge>,
    <Badge key={`priority-${conversation.id}`} tone={getPriorityTone(conversation.priority)}>
      {conversation.priority}
    </Badge>,
    conversation.emails.length,
    conversation.responses.length,
    new Date(conversation.updatedAt).toLocaleDateString(),
    <Button
      key={`view-${conversation.id}`}
      size="micro"
      onClick={() => setSelectedConversation(conversation.id)}
    >
      View
    </Button>,
  ]);

  const escalatedRows = escalated.map((conversation) => [
    conversation.customerEmail,
    conversation.customerName || '-',
    conversation.shopifyOrderId || '-',
    <Badge key={conversation.id} tone="critical">
      ESCALATED
    </Badge>,
    conversation.emails.length,
    new Date(conversation.updatedAt).toLocaleDateString(),
    <Button
      key={`view-${conversation.id}`}
      size="micro"
      onClick={() => setSelectedConversation(conversation.id)}
    >
      Review
    </Button>,
  ]);

  const selectedConversationData = conversations.find(c => c.id === selectedConversation) || 
                                  escalated.find(c => c.id === selectedConversation);

  return (
    <Page title="AI Customer Support Dashboard">
      <Layout>
        {error && (
          <Layout.Section>
            <CalloutCard
              title="Error"
              illustration="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
              primaryAction={{
                content: "Retry",
                onAction: () => window.location.reload(),
              }}
            >
              <Text as="p">{error}</Text>
            </CalloutCard>
          </Layout.Section>
        )}

        {actionData && (
          <Layout.Section>
            {actionData.success ? (
              <Card>
                <BlockStack gap="2">
                  <Text as="h3" variant="headingMd" tone="success">✅ Success</Text>
                  <Text as="p">{actionData.message}</Text>
                </BlockStack>
              </Card>
            ) : (
              <Card>
                <BlockStack gap="2">
                  <Text as="h3" variant="headingMd" tone="critical">❌ Error</Text>
                  <Text as="p">{actionData.message}</Text>
                  <Button onClick={() => window.location.reload()}>Retry</Button>
                </BlockStack>
              </Card>
            )}
          </Layout.Section>
        )}

        {/* Stats Overview */}
        <Layout.Section>
          <InlineStack gap="4">
            <Card>
              <BlockStack gap="2">
                <Text as="h3" variant="headingMd">Total Conversations</Text>
                <Text as="p" variant="heading2xl">{stats.totalConversations}</Text>
              </BlockStack>
            </Card>
            
            <Card>
              <BlockStack gap="2">
                <Text as="h3" variant="headingMd">Escalated</Text>
                <Text as="p" variant="heading2xl" tone="critical">{stats.escalatedCount}</Text>
              </BlockStack>
            </Card>
            
            <Card>
              <BlockStack gap="2">
                <Text as="h3" variant="headingMd">Active</Text>
                <Text as="p" variant="heading2xl" tone="success">{stats.activeCount}</Text>
              </BlockStack>
            </Card>
            
            <Card>
              <BlockStack gap="2">
                <Text as="h3" variant="headingMd">Resolved</Text>
                <Text as="p" variant="heading2xl">{stats.resolvedCount}</Text>
              </BlockStack>
            </Card>
          </InlineStack>
        </Layout.Section>

        {/* Control Panel */}
        <Layout.Section>
          <Card>
            <BlockStack gap={4}>
              <Text as="h2" variant="headingLg">Control Panel</Text>
              <InlineStack gap={3}>
                <Button
                  primary
                  loading={isProcessing}
                  onClick={handleProcessEmails}
                  disabled={isProcessing}
                >
                  {isProcessing ? "Processing..." : "Process New Emails"}
                </Button>
                
                <Button
                  onClick={handleInitialize}
                >
                  Initialize System
                </Button>
              </InlineStack>
              
              {isProcessing && (
                <BlockStack gap="2">
                  <Text as="p">Processing emails from Gmail...</Text>
                  <ProgressBar progress={50} />
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Escalated Conversations */}
        {escalated.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="4">
                <Text as="h2" variant="headingLg">🚨 Escalated Conversations (Need Attention)</Text>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'numeric', 'text', 'text']}
                  headings={['Customer Email', 'Name', 'Order ID', 'Status', 'Emails', 'Last Updated', 'Action']}
                  rows={escalatedRows}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* All Conversations */}
        <Layout.Section>
          <Card>
            <BlockStack gap="4">
              <Text as="h2" variant="headingLg">All Conversations</Text>
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'numeric', 'numeric', 'text', 'text']}
                headings={[
                  'Customer Email', 
                  'Name', 
                  'Order ID', 
                  'Status', 
                  'Priority', 
                  'Emails', 
                  'Responses',
                  'Last Updated', 
                  'Action'
                ]}
                rows={conversationRows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Conversation Detail Modal */}
        {selectedConversation && selectedConversationData && (
          <Modal
            open={!!selectedConversation}
            onClose={() => setSelectedConversation(null)}
            title={`Conversation: ${selectedConversationData.customerEmail}`}
            size="large"
          >
            <Modal.Section>
              <BlockStack gap="4">
                {/* Conversation Info */}
                <Card>
                  <BlockStack gap="3">
                    <Text as="h3" variant="headingMd">Conversation Details</Text>
                    <InlineStack gap="4">
                      <Text as="p"><strong>Customer:</strong> {selectedConversationData.customerName || selectedConversationData.customerEmail}</Text>
                      <Text as="p"><strong>Order ID:</strong> {selectedConversationData.shopifyOrderId || 'N/A'}</Text>
                      <Badge tone={getStatusTone(selectedConversationData.status)}>
                        {selectedConversationData.status}
                      </Badge>
                      <Badge tone={getPriorityTone(selectedConversationData.priority)}>
                        {selectedConversationData.priority}
                      </Badge>
                    </InlineStack>
                  </BlockStack>
                </Card>

                {/* Emails */}
                <Card>
                  <BlockStack gap="3">
                    <Text as="h3" variant="headingMd">Customer Emails</Text>
                    {selectedConversationData.emails.map((email) => (
                      <Card key={email.id} background="bg-surface-secondary">
                        <BlockStack gap="2">
                          <InlineStack gap="2" align="space-between">
                            <Text as="p" variant="headingSm">{email.subject}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {new Date(email.receivedAt).toLocaleString()}
                            </Text>
                          </InlineStack>
                          <Text as="p">{email.body}</Text>
                        </BlockStack>
                      </Card>
                    ))}
                  </BlockStack>
                </Card>

                {/* AI Responses */}
                <Card>
                  <BlockStack gap="3">
                    <Text as="h3" variant="headingMd">AI Responses</Text>
                    {selectedConversationData.responses.map((response) => (
                      <Card key={response.id} background="bg-surface-success-subdued">
                        <BlockStack gap="2">
                          <InlineStack gap="2" align="space-between">
                            <InlineStack gap="2">
                              <Badge tone={response.escalated ? "critical" : "success"}>
                                {response.escalated ? "ESCALATED" : "SENT"}
                              </Badge>
                              <Text as="p" variant="bodySm">
                                Confidence: {(response.confidence * 100).toFixed(1)}%
                              </Text>
                            </InlineStack>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {new Date(response.createdAt).toLocaleString()}
                            </Text>
                          </InlineStack>
                          <Text as="p">{response.responseText}</Text>
                          {response.sentAt && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              Sent at: {new Date(response.sentAt).toLocaleString()}
                            </Text>
                          )}
                        </BlockStack>
                      </Card>
                    ))}
                  </BlockStack>
                </Card>
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}
      </Layout>
    </Page>
  );
}

function getStatusTone(status: string): "success" | "attention" | "critical" | "info" | undefined {
  switch (status) {
    case 'ACTIVE': return 'info';
    case 'RESOLVED': return 'success';
    case 'ESCALATED': return 'critical';
    case 'ARCHIVED': return undefined;
    default: return undefined;
  }
}

function getPriorityTone(priority: string): "success" | "attention" | "critical" | "info" | undefined {
  switch (priority) {
    case 'LOW': return 'success';
    case 'NORMAL': return 'info';
    case 'HIGH': return 'attention';
    case 'URGENT': return 'critical';
    default: return undefined;
  }
} 