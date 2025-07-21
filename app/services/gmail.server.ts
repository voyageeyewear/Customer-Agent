import { google } from 'googleapis';
import { simpleParser } from 'mailparser';
import type { gmail_v1 } from 'googleapis';

export class GmailService {
  private gmail: gmail_v1.Gmail;
  private auth: any;

  constructor() {
    this.auth = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );

    this.auth.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });

    this.gmail = google.gmail({ version: 'v1', auth: this.auth });
  }

  /**
   * Get unread emails from inbox
   */
  async getUnreadEmails(maxResults: number = 10): Promise<GmailEmail[]> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread in:inbox',
        maxResults,
      });

      const messages = response.data.messages || [];
      const emails: GmailEmail[] = [];

      for (const message of messages) {
        if (message.id) {
          const email = await this.getEmailDetails(message.id);
          if (email) {
            emails.push(email);
          }
        }
      }

      return emails;
    } catch (error) {
      console.error('Error fetching unread emails:', error);
      throw new Error('Failed to fetch unread emails');
    }
  }

  /**
   * Get detailed email information
   */
  async getEmailDetails(messageId: string): Promise<GmailEmail | null> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      const headers = message.payload?.headers || [];
      
      const subject = this.getHeader(headers, 'Subject') || '';
      const from = this.getHeader(headers, 'From') || '';
      const date = this.getHeader(headers, 'Date') || '';
      const threadId = message.threadId || '';

      // Extract email address and name from "From" header
      const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/) || [null, from, from];
      const fromName = fromMatch[1]?.trim().replace(/"/g, '') || '';
      const fromEmail = fromMatch[2]?.trim() || from;

      // Get email body
      const { textBody, htmlBody } = await this.extractEmailBody(message.payload);

      return {
        id: messageId,
        threadId,
        subject,
        fromEmail,
        fromName,
        body: textBody,
        htmlBody,
        receivedAt: new Date(date),
        snippet: message.snippet || '',
      };
    } catch (error) {
      console.error(`Error getting email details for ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Send reply email
   */
  async sendReply(
    to: string,
    subject: string,
    body: string,
    threadId?: string
  ): Promise<boolean> {
    try {
      const raw = this.createEmailRaw(to, subject, body, threadId);
      
      await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw,
          threadId,
        },
      });

      return true;
    } catch (error) {
      console.error('Error sending reply:', error);
      return false;
    }
  }

  /**
   * Mark email as read
   */
  async markAsRead(messageId: string): Promise<boolean> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
      return true;
    } catch (error) {
      console.error('Error marking email as read:', error);
      return false;
    }
  }

  /**
   * Create email draft for manual review
   */
  async createDraft(
    to: string,
    subject: string,
    body: string,
    threadId?: string
  ): Promise<string | null> {
    try {
      const raw = this.createEmailRaw(to, subject, body, threadId);
      
      const response = await this.gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw,
            threadId,
          },
        },
      });

      return response.data.id || null;
    } catch (error) {
      console.error('Error creating draft:', error);
      return null;
    }
  }

  /**
   * Helper methods
   */
  private getHeader(headers: any[], name: string): string | undefined {
    const header = headers.find((h) => h.name === name);
    return header?.value;
  }

  private async extractEmailBody(payload: any): Promise<{ textBody: string; htmlBody: string }> {
    let textBody = '';
    let htmlBody = '';

    if (payload.parts) {
      // Multipart email
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          textBody += this.decodeBase64(part.body.data);
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          htmlBody += this.decodeBase64(part.body.data);
        } else if (part.parts) {
          // Nested parts
          const nested = await this.extractEmailBody(part);
          textBody += nested.textBody;
          htmlBody += nested.htmlBody;
        }
      }
    } else if (payload.body?.data) {
      // Single part email
      const decodedBody = this.decodeBase64(payload.body.data);
      if (payload.mimeType === 'text/plain') {
        textBody = decodedBody;
      } else if (payload.mimeType === 'text/html') {
        htmlBody = decodedBody;
      }
    }

    return { textBody, htmlBody };
  }

  private decodeBase64(data: string): string {
    return Buffer.from(data, 'base64').toString('utf8');
  }

  private createEmailRaw(to: string, subject: string, body: string, threadId?: string): string {
    const lines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=UTF-8',
      'MIME-Version: 1.0',
      '',
      body,
    ];

    if (threadId) {
      lines.splice(3, 0, `In-Reply-To: ${threadId}`);
      lines.splice(4, 0, `References: ${threadId}`);
    }

    return Buffer.from(lines.join('\n')).toString('base64url');
  }
}

export interface GmailEmail {
  id: string;
  threadId: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  body: string;
  htmlBody: string;
  receivedAt: Date;
  snippet: string;
} 