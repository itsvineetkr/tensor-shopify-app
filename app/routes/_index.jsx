import { useLoaderData, useActionData, useNavigation } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import axios from "axios";

export async function loader({ request }) {
  await authenticate.admin(request);
  return new Response(JSON.stringify({}), {
    headers: { "Content-Type": "application/json" }
  });
};

export async function action({ request }) {
  // Ensure it's a POST request
  if (request.method !== "POST") {
    throw new Response("Method not allowed", { status: 405 });
  }

  const { admin, session } = await authenticate.admin(request);
  
  try {
    // Get shop domain from session
    const shopDomain = session.shop;
    
    // Function to fetch all products with pagination
    async function fetchAllProducts() {
      let allProducts = [];
      let hasNextPage = true;
      let cursor = null;

      while (hasNextPage) {
        const query = `#graphql
          query getProducts($first: Int!, $after: String) {
            products(first: $first, after: $after) {
              pageInfo {
          hasNextPage
          endCursor
              }
              edges {
          node {
            id
            title
            handle
            description
            descriptionHtml
            status
            createdAt
            updatedAt
            publishedAt
            productType
            vendor
            tags
            totalInventory
            tracksInventory
            onlineStoreUrl
            seo {
              title
              description
            }
            options {
              id
              name
              values
            }
            variants(first: 100) {
              edges {
                node {
            id
            title
            price
            compareAtPrice
            sku
            barcode
            inventoryQuantity
            taxable
            inventoryPolicy
            availableForSale
            selectedOptions {
              name
              value
            }
            image {
              url
              altText
            }
                }
              }
            }
            media(first: 20) {
              edges {
                node {
            ... on MediaImage {
              id
              image {
                url
                altText
                width
                height
              }
              mediaContentType
            }
                }
              }
            }
            collections(first: 10) {
              edges {
                node {
            id
            title
            handle
                }
              }
            }
            metafields(first: 50) {
              edges {
                node {
            id
            namespace
            key
            value
            type
                }
              }
            }
          }
              }
            }
          }`;

        const response = await admin.graphql(query, {
          variables: {
            first: 50,
            after: cursor,
          },
        });

        const responseJson = await response.json();
        const products = responseJson.data.products;
        
        allProducts = allProducts.concat(products.edges.map(edge => edge.node));
        hasNextPage = products.pageInfo.hasNextPage;
        cursor = products.pageInfo.endCursor;
      }

      return allProducts;
    }

    // Fetch all products
    console.log("Starting to fetch products...");
    const products = await fetchAllProducts();
    console.log(`Fetched ${products.length} products`);

    // Convert to JSONL format
    const jsonlData = products.map(product => JSON.stringify(product)).join('\n');

    // Create FormData to send shop_domain and file
    const formData = new FormData();
    formData.append('shop_domain', shopDomain);
    
    // Create a Blob from the JSONL data and append as file
    const blob = new Blob([jsonlData], { type: 'application/x-jsonlines' });
    formData.append('data', blob, 'products.jsonl');

    console.log(`Sending data for shop: ${shopDomain}`);

    // Call your external API using Axios
    const apiResponse = await axios.post(
      'https://7847-183-82-160-126.ngrok-free.app/api/v1/sync-shopify-data',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000, // 30 second timeout
      }
    );

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Processed ${products.length} products from ${shopDomain} successfully`,
      shopDomain: shopDomain,
      productCount: products.length,
      apiResult: apiResponse.data 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Error:', error);
    
    // Handle Axios specific errors
    if (error.response) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: `API request failed: ${error.response.status} - ${error.response.statusText}`,
        details: error.response.data
      }), {
        headers: { "Content-Type": "application/json" }
      });
    } else if (error.request) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Network error: Unable to reach the API server'
      }), {
        headers: { "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Error processing products: ' + error.message 
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};

export default function Index() {
  const data = useLoaderData();
  const actionData = useActionData(); // Get action result data
  const navigation = useNavigation(); // Get navigation state
  
  const isLoading = navigation.state === "submitting";

  const handleButtonClick = () => {
    console.log("Button clicked, starting process...");
    // Using a form instead of submit for better UX
    const form = document.createElement('form');
    form.method = 'POST';
    form.style.display = 'none';
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div style={{ 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      backgroundColor: '#fafafa',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <header style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e1e5e9',
        padding: '24px 0',
        textAlign: 'center'
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '32px',
          fontWeight: '600',
          color: '#1a1a1a'
        }}>
          TensorSolution
        </h1>
      </header>

      {/* Main Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
        
        {/* Status Messages */}
        {actionData && (
          <div style={{
            backgroundColor: actionData.success ? '#d1fae5' : '#fef2f2',
            border: `1px solid ${actionData.success ? '#10b981' : '#ef4444'}`,
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{
                fontSize: '20px'
              }}>
                {actionData.success ? '✅' : '❌'}
              </span>
              <div>
                <h3 style={{
                  margin: '0 0 4px 0',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: actionData.success ? '#065f46' : '#991b1b'
                }}>
                  {actionData.success ? 'Sync Successful!' : 'Sync Failed'}
                </h3>
                <p style={{
                  margin: 0,
                  fontSize: '14px',
                  color: actionData.success ? '#047857' : '#dc2626'
                }}>
                  {actionData.message}
                </p>
                {actionData.success && (
                  <div style={{
                    marginTop: '8px',
                    fontSize: '14px',
                    color: '#047857'
                  }}>
                    <p style={{ margin: '0 0 4px 0' }}>
                      <strong>Shop:</strong> {actionData.shopDomain}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Products synced:</strong> {actionData.productCount}
                    </p>
                  </div>
                )}
                {actionData.details && (
                  <details style={{ marginTop: '8px' }}>
                    <summary style={{ 
                      cursor: 'pointer', 
                      fontSize: '14px',
                      color: '#dc2626'
                    }}>
                      View error details
                    </summary>
                    <pre style={{
                      backgroundColor: '#f3f4f6',
                      padding: '8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      marginTop: '8px',
                      overflow: 'auto'
                    }}>
                      {JSON.stringify(actionData.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* API Documentation Section */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e1e5e9',
          overflow: 'hidden',
          marginBottom: '40px'
        }}>
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '20px',
            borderBottom: '1px solid #e1e5e9'
          }}>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600', color: '#1a1a1a' }}>
              Shopify Search API
            </h2>
            <p style={{ margin: '8px 0 0 0', color: '#6b7280' }}>
              Vector and keyword search for your Shopify products
            </p>
          </div>
          
          <div style={{ display: 'flex', minHeight: '600px' }}>
            {/* Left Column - Documentation */}
            <div style={{ 
              flex: 1, 
              padding: '24px',
              borderRight: '1px solid #e1e5e9'
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
                Parameters
              </h3>
              
              <div style={{ marginBottom: '20px' }}>
                <code style={{ 
                  backgroundColor: '#f3f4f6', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  fontWeight: '600'
                }}>shop_domain</code>
                <span style={{ color: '#ef4444', marginLeft: '8px' }}>required</span>
                <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
                  Your Shopify shop domain (e.g., "mystore.myshopify.com")
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <code style={{ 
                  backgroundColor: '#f3f4f6', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  fontWeight: '600'
                }}>query</code>
                <span style={{ color: '#ef4444', marginLeft: '8px' }}>required</span>
                <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
                  Search query string. Use "*" for all products.
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <code style={{ 
                  backgroundColor: '#f3f4f6', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  fontWeight: '600'
                }}>search_type</code>
                <span style={{ color: '#ef4444', marginLeft: '8px' }}>required</span>
                <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
                  Search method: "vector" for semantic search or "keyword" for exact match
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <code style={{ 
                  backgroundColor: '#f3f4f6', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  fontWeight: '600'
                }}>query_by</code>
                <span style={{ color: '#10b981', marginLeft: '8px' }}>optional</span>
                <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
                  Fields to search in (default: "title, body, tags, productType")
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <code style={{ 
                  backgroundColor: '#f3f4f6', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  fontWeight: '600'
                }}>filter_by</code>
                <span style={{ color: '#10b981', marginLeft: '8px' }}>optional</span>
                <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
                  Filter conditions (e.g., "price:&gt;100")
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <code style={{ 
                  backgroundColor: '#f3f4f6', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  fontWeight: '600'
                }}>sort_by</code>
                <span style={{ color: '#10b981', marginLeft: '8px' }}>optional</span>
                <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
                  Sort order (e.g., "price:desc")
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <code style={{ 
                  backgroundColor: '#f3f4f6', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  fontWeight: '600'
                }}>per_page</code>
                <span style={{ color: '#10b981', marginLeft: '8px' }}>optional</span>
                <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
                  Number of results per page (default: 10)
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <code style={{ 
                  backgroundColor: '#f3f4f6', 
                  padding: '2px 6px', 
                  borderRadius: '4px',
                  fontWeight: '600'
                }}>page</code>
                <span style={{ color: '#10b981', marginLeft: '8px' }}>optional</span>
                <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
                  Page number (default: 1)
                </p>
              </div>
            </div>
            
            {/* Right Column - cURL Example */}
            <div style={{ 
              flex: 1, 
              backgroundColor: '#1f2937',
              padding: '24px',
              color: '#ffffff'
            }}>
              <h3 style={{ 
                margin: '0 0 16px 0', 
                fontSize: '18px', 
                fontWeight: '600',
                color: '#ffffff'
              }}>
                Example Request
              </h3>
              
              <pre style={{
                backgroundColor: '#111827',
                padding: '16px',
                borderRadius: '6px',
                fontSize: '14px',
                lineHeight: '1.5',
                overflow: 'auto',
                margin: 0,
                fontFamily: 'Monaco, Menlo, monospace'
              }}>
{`curl -X POST "https://your-api.com/shopify-search" \\
  -H "Content-Type: application/json" \\
  -d '{
    "shop_domain": "mystore.myshopify.com",
    "query": "wireless headphones",
    "search_type": "vector",
    "query_by": "title, body, tags",
    "filter_by": "price:>50",
    "sort_by": "price:desc",
    "per_page": 20,
    "page": 1
  }'`}
              </pre>

              <div style={{ marginTop: '24px' }}>
                <h4 style={{ 
                  fontSize: '16px', 
                  fontWeight: '600',
                  margin: '0 0 12px 0',
                  color: '#ffffff'
                }}>
                  Response Format
                </h4>
                <pre style={{
                  backgroundColor: '#111827',
                  padding: '16px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  overflow: 'auto',
                  margin: 0,
                  fontFamily: 'Monaco, Menlo, monospace'
                }}>
{`{
  "status": "success",
  "response": [
    {
      "found": 42,
      "hits": [
        {
          "document": {
            "id": "gid://shopify/Product/123",
            "title": "Wireless Headphones",
            "price": 99.99,
            ...
          }
        }
      ]
    }
  ]
}`}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Sync Products Section */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e1e5e9',
          padding: '32px',
          textAlign: 'center'
        }}>
          <h3 style={{ 
            margin: '0 0 8px 0', 
            fontSize: '20px', 
            fontWeight: '600',
            color: '#1a1a1a'
          }}>
            Product Synchronization
          </h3>
          <p style={{ 
            margin: '0 0 24px 0', 
            color: '#6b7280',
            fontSize: '14px'
          }}>
            Sync all products from your Shopify store to enable search functionality
          </p>
          
          <form method="post" action="/?index" style={{ display: 'inline-block' }}>
            <button 
              type="submit"
              disabled={isLoading}
              style={{
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: '500',
                backgroundColor: isLoading ? '#9ca3af' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.target.style.backgroundColor = '#1d4ed8';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  e.target.style.backgroundColor = '#2563eb';
                }
              }}
            >
              {isLoading && (
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid #ffffff',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
              )}
              {isLoading ? 'Syncing...' : 'Sync Products'}
            </button>
          </form>
          
          {isLoading && (
            <p style={{
              marginTop: '16px',
              color: '#6b7280',
              fontSize: '14px'
            }}>
              Please wait while we sync your products. This may take a few moments...
            </p>
          )}
        </div>
      </div>
      
      {/* Add CSS animation for loading spinner */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `
      }} />
    </div>
  );
}