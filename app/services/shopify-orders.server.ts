import { authenticate } from "../shopify.server";

export class ShopifyOrdersService {
  constructor(private request: Request) {}

  /**
   * Find orders by customer email
   */
  async findOrdersByEmail(email: string): Promise<ShopifyOrder[]> {
    try {
      const { admin } = await authenticate.admin(this.request);
      
      // First, find customers by email
      const customerResponse = await admin.graphql(`
        query findCustomersByEmail($email: String!) {
          customers(first: 10, query: $email) {
            edges {
              node {
                id
                email
                firstName
                lastName
                phone
                createdAt
                orders(first: 20) {
                  edges {
                    node {
                      id
                      name
                      email
                      phone
                      processedAt
                      fulfillmentStatus
                      financialStatus
                      totalPrice
                      totalShipping
                      shippingAddress {
                        firstName
                        lastName
                        address1
                        address2
                        city
                        province
                        country
                        zip
                      }
                      lineItems(first: 10) {
                        edges {
                          node {
                            id
                            title
                            quantity
                            variantTitle
                            sku
                            price
                          }
                        }
                      }
                      fulfillments {
                        id
                        status
                        trackingCompany
                        trackingNumbers
                        trackingUrls
                        estimatedDeliveryAt
                        deliveredAt
                        createdAt
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `, {
        variables: { email }
      });

      const customerData = await customerResponse.json();
      const customers = customerData.data?.customers?.edges || [];
      
      const orders: ShopifyOrder[] = [];
      
      for (const customerEdge of customers) {
        const customer = customerEdge.node;
        const customerOrders = customer.orders?.edges || [];
        
        for (const orderEdge of customerOrders) {
          const order = orderEdge.node;
          orders.push(this.transformOrder(order, customer));
        }
      }

      // Sort by most recent first
      return orders.sort((a, b) => 
        new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime()
      );

    } catch (error) {
      console.error('Error finding orders by email:', error);
      throw new Error('Failed to fetch orders from Shopify');
    }
  }

  /**
   * Find order by order number
   */
  async findOrderByNumber(orderNumber: string): Promise<ShopifyOrder | null> {
    try {
      const { admin } = await authenticate.admin(this.request);
      
      const orderResponse = await admin.graphql(`
        query findOrderByNumber($orderNumber: String!) {
          orders(first: 1, query: $orderNumber) {
            edges {
              node {
                id
                name
                email
                phone
                processedAt
                fulfillmentStatus
                financialStatus
                totalPrice
                totalShipping
                customer {
                  id
                  email
                  firstName
                  lastName
                  phone
                }
                shippingAddress {
                  firstName
                  lastName
                  address1
                  address2
                  city
                  province
                  country
                  zip
                }
                lineItems(first: 10) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      variantTitle
                      sku
                      price
                    }
                  }
                }
                fulfillments {
                  id
                  status
                  trackingCompany
                  trackingNumbers
                  trackingUrls
                  estimatedDeliveryAt
                  deliveredAt
                  createdAt
                }
              }
            }
          }
        }
      `, {
        variables: { orderNumber }
      });

      const orderData = await orderResponse.json();
      const orders = orderData.data?.orders?.edges || [];
      
      if (orders.length === 0) {
        return null;
      }

      const order = orders[0].node;
      return this.transformOrder(order, order.customer);

    } catch (error) {
      console.error('Error finding order by number:', error);
      return null;
    }
  }

  /**
   * Get order status summary
   */
  async getOrderStatusSummary(email: string): Promise<OrderStatusSummary> {
    const orders = await this.findOrdersByEmail(email);
    
    const summary: OrderStatusSummary = {
      totalOrders: orders.length,
      recentOrders: orders.slice(0, 3),
      pendingFulfillment: orders.filter(o => o.fulfillmentStatus === 'UNFULFILLED').length,
      inTransit: orders.filter(o => o.fulfillmentStatus === 'PARTIAL' || o.fulfillments.some(f => f.status === 'IN_TRANSIT')).length,
      delivered: orders.filter(o => o.fulfillmentStatus === 'FULFILLED' || o.fulfillments.some(f => f.status === 'DELIVERED')).length,
    };

    return summary;
  }

  /**
   * Extract order number from text (e.g., "#1001", "order 1001", etc.)
   */
  static extractOrderNumber(text: string): string | null {
    // Match patterns like #1001, order 1001, order number 1001, etc.
    const patterns = [
      /#(\d+)/,
      /order\s+(?:number\s+)?(\d+)/i,
      /order\s+#(\d+)/i,
      /\b(\d{4,})\b/, // 4+ digit numbers
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Transform Shopify order data to our format
   */
  private transformOrder(order: any, customer: any): ShopifyOrder {
    return {
      id: order.id,
      orderNumber: order.name,
      email: order.email || customer?.email || '',
      phone: order.phone || customer?.phone || '',
      processedAt: order.processedAt,
      fulfillmentStatus: order.fulfillmentStatus,
      financialStatus: order.financialStatus,
      totalPrice: order.totalPrice,
      totalShipping: order.totalShipping,
      customer: customer ? {
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone: customer.phone,
      } : null,
      shippingAddress: order.shippingAddress,
      items: order.lineItems?.edges?.map((edge: any) => edge.node) || [],
      fulfillments: order.fulfillments || [],
    };
  }
}

export interface ShopifyOrder {
  id: string;
  orderNumber: string;
  email: string;
  phone: string;
  processedAt: string;
  fulfillmentStatus: string;
  financialStatus: string;
  totalPrice: string;
  totalShipping: string;
  customer: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
  shippingAddress: {
    firstName: string;
    lastName: string;
    address1: string;
    address2: string;
    city: string;
    province: string;
    country: string;
    zip: string;
  };
  items: {
    id: string;
    title: string;
    quantity: number;
    variantTitle: string;
    sku: string;
    price: string;
  }[];
  fulfillments: {
    id: string;
    status: string;
    trackingCompany: string;
    trackingNumbers: string[];
    trackingUrls: string[];
    estimatedDeliveryAt: string;
    deliveredAt: string;
    createdAt: string;
  }[];
}

export interface OrderStatusSummary {
  totalOrders: number;
  recentOrders: ShopifyOrder[];
  pendingFulfillment: number;
  inTransit: number;
  delivered: number;
} 