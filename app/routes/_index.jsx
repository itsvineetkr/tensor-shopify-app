import { useLoaderData, useActionData, useNavigation, Form } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import axios from "axios";

// ==================== LOADER ====================
export async function loader({ request }) {
    await authenticate.admin(request);
    return {};
}

// ==================== ACTION (BACKEND LOGIC) ====================
export async function action({ request }) {
    if (request.method !== "POST") {
        throw new Response("Method not allowed", { status: 405 });
    }

    const { admin, session } = await authenticate.admin(request);

    try {
        const shopDomain = session.shop;
        console.log(`Starting product sync for shop: ${shopDomain}`);

        // Fetch all products using modern Shopify Admin API
        const products = await fetchAllProducts(admin);
        console.log(`Successfully fetched ${products.length} products`);

        // Convert to JSONL format and send to external API
        const syncResult = await syncProductsToAPI(products, shopDomain);

        return Response.json({
            success: true,
            message: `Successfully synced ${products.length} products from ${shopDomain}`,
            shopDomain,
            productCount: products.length,
            apiResult: syncResult
        });

    } catch (error) {
        console.error('Sync error:', error);
        return handleSyncError(error);
    }
}

// ==================== BACKEND HELPER FUNCTIONS ====================

/**
 * Fetch all products using Shopify Admin GraphQL API with pagination
 */
async function fetchAllProducts(admin) {
    const allProducts = [];
    let hasNextPage = true;
    let cursor = null;

    const PRODUCTS_QUERY = `#graphql
    query GetProducts($first: Int!, $after: String) {
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

    while (hasNextPage) {
        const response = await admin.graphql(PRODUCTS_QUERY, {
            variables: {
                first: 50,
                after: cursor,
            },
        });

        const responseJson = await response.json();

        if (responseJson.errors) {
            throw new Error(`GraphQL Error: ${JSON.stringify(responseJson.errors)}`);
        }

        const { products } = responseJson.data;
        allProducts.push(...products.edges.map(edge => edge.node));

        hasNextPage = products.pageInfo.hasNextPage;
        cursor = products.pageInfo.endCursor;
    }

    return allProducts;
}

/**
 * Convert products to JSONL format and sync to external API
 */
async function syncProductsToAPI(products, shopDomain) {
    // Convert to JSONL format
    const jsonlData = products.map(product => JSON.stringify(product)).join('\n');

    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('shop_domain', shopDomain);

    const blob = new Blob([jsonlData], { type: 'application/x-jsonlines' });
    formData.append('data', blob, 'products.jsonl');

    // Send to external API
    const apiResponse = await axios.post(
        'https://9466-183-82-160-126.ngrok-free.app/api/v1/sync-shopify-data',
        formData,
        {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            timeout: 60000, // 60 second timeout for large datasets
        }
    );

    return apiResponse.data;
}

/**
 * Handle different types of sync errors
 */
function handleSyncError(error) {
    if (axios.isAxiosError(error)) {
        if (error.response) {
            return Response.json({
                success: false,
                message: `API request failed: ${error.response.status} - ${error.response.statusText}`,
                details: error.response.data
            });
        } else if (error.request) {
            return Response.json({
                success: false,
                message: 'Network error: Unable to reach the API server'
            });
        }
    }

    return Response.json({
        success: false,
        message: `Sync failed: ${error.message}`
    });
}

// ==================== FRONTEND COMPONENT ====================

export default function ProductSyncPage() {
    const data = useLoaderData();
    const actionData = useActionData();
    const navigation = useNavigation();

    const isLoading = navigation.state === "submitting";

    return (
        <div style={styles.container}>
            <Header />

            <main style={styles.main}>
                <StatusMessage actionData={actionData} />
                <APIDocumentation />
                <SyncSection isLoading={isLoading} />
            </main>

            <LoadingSpinnerStyles />
        </div>
    );
}

// ==================== UI COMPONENTS ====================

function Header() {
    return (
        <header style={styles.header}>
            <h1 style={styles.headerTitle}>TensorSolution</h1>
        </header>
    );
}

function StatusMessage({ actionData }) {
    if (!actionData) return null;

    const isSuccess = actionData.success;

    return (
        <div style={{
            ...styles.statusMessage,
            backgroundColor: isSuccess ? '#d1fae5' : '#fef2f2',
            borderColor: isSuccess ? '#10b981' : '#ef4444'
        }}>
            <div style={styles.statusHeader}>
                <span style={styles.statusIcon}>
                    {isSuccess ? '✅' : '❌'}
                </span>
                <div>
                    <h3 style={{
                        ...styles.statusTitle,
                        color: isSuccess ? '#065f46' : '#991b1b'
                    }}>
                        {isSuccess ? 'Sync Successful!' : 'Sync Failed'}
                    </h3>
                    <p style={{
                        ...styles.statusMessage,
                        color: isSuccess ? '#047857' : '#dc2626'
                    }}>
                        {actionData.message}
                    </p>

                    {isSuccess && (
                        <div style={styles.successDetails}>
                            <p style={styles.successDetailItem}>
                                <strong>Shop:</strong> {actionData.shopDomain}
                            </p>
                            <p style={styles.successDetailItem}>
                                <strong>Products synced:</strong> {actionData.productCount}
                            </p>
                        </div>
                    )}

                    {actionData.details && (
                        <details style={styles.errorDetails}>
                            <summary style={styles.errorSummary}>
                                View error details
                            </summary>
                            <pre style={styles.errorPre}>
                                {JSON.stringify(actionData.details, null, 2)}
                            </pre>
                        </details>
                    )}
                </div>
            </div>
        </div>
    );
}

function APIDocumentation() {
    return (
        <div style={styles.apiDoc}>
            <div style={styles.apiDocHeader}>
                <h2 style={styles.apiDocTitle}>Shopify Search API</h2>
                <p style={styles.apiDocSubtitle}>
                    Vector and keyword search for your Shopify products
                </p>
            </div>

            <div style={styles.apiDocContent}>
                <div style={styles.apiDocLeft}>
                    <h3 style={styles.parametersTitle}>Parameters</h3>

                    {API_PARAMETERS.map((param) => (
                        <div key={param.name} style={styles.parameter}>
                            <code style={styles.parameterName}>{param.name}</code>
                            <span style={{
                                ...styles.parameterBadge,
                                color: param.required ? '#ef4444' : '#10b981'
                            }}>
                                {param.required ? 'required' : 'optional'}
                            </span>
                            <p style={styles.parameterDescription}>{param.description}</p>
                        </div>
                    ))}
                </div>

                <div style={styles.apiDocRight}>
                    <h3 style={styles.exampleTitle}>Example Request</h3>
                    <pre style={styles.curlExample}>{CURL_EXAMPLE}</pre>

                    <div style={styles.responseSection}>
                        <h4 style={styles.responseTitle}>Response Format</h4>
                        <pre style={styles.responseExample}>{RESPONSE_EXAMPLE}</pre>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SyncSection({ isLoading }) {
    return (
        <div style={styles.syncSection}>
            <h3 style={styles.syncTitle}>Product Synchronization</h3>
            <p style={styles.syncSubtitle}>
                Sync all products from your Shopify store to enable search functionality
            </p>

            <Form method="post" style={styles.syncForm}>
                <button
                    type="submit"
                    disabled={isLoading}
                    style={{
                        ...styles.syncButton,
                        backgroundColor: isLoading ? '#9ca3af' : '#2563eb',
                        cursor: isLoading ? 'not-allowed' : 'pointer'
                    }}
                    onMouseEnter={(e) => {
                        if (!isLoading) e.target.style.backgroundColor = '#1d4ed8';
                    }}
                    onMouseLeave={(e) => {
                        if (!isLoading) e.target.style.backgroundColor = '#2563eb';
                    }}
                >
                    {isLoading && <div style={styles.spinner}></div>}
                    {isLoading ? 'Syncing...' : 'Sync Products'}
                </button>
            </Form>

            {isLoading && (
                <p style={styles.loadingText}>
                    Please wait while we sync your products. This may take a few moments...
                </p>
            )}
        </div>
    );
}

function LoadingSpinnerStyles() {
    return (
        <style dangerouslySetInnerHTML={{
            __html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `
        }} />
    );
}

// ==================== CONSTANTS ====================

const API_PARAMETERS = [
    {
        name: 'shop_domain',
        required: true,
        description: 'Your Shopify shop domain (e.g., "mystore.myshopify.com")'
    },
    {
        name: 'query',
        required: true,
        description: 'Search query string. Use "*" for all products.'
    },
    {
        name: 'search_type',
        required: true,
        description: 'Search method: "vector" for semantic search or "keyword" for exact match'
    },
    {
        name: 'query_by',
        required: false,
        description: 'Fields to search in (default: "title, body, tags, productType")'
    },
    {
        name: 'filter_by',
        required: false,
        description: 'Filter conditions (e.g., "price:>100")'
    },
    {
        name: 'sort_by',
        required: false,
        description: 'Sort order (e.g., "price:desc")'
    },
    {
        name: 'per_page',
        required: false,
        description: 'Number of results per page (default: 10)'
    },
    {
        name: 'page',
        required: false,
        description: 'Page number (default: 1)'
    }
];

const CURL_EXAMPLE = `curl -X POST "https://your-api.com/shopify-search" \\
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
  }'`;

const RESPONSE_EXAMPLE = `{
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
}`;

// ==================== STYLES ====================

const styles = {
    container: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: '#fafafa',
        minHeight: '100vh'
    },

    header: {
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e1e5e9',
        padding: '24px 0',
        textAlign: 'center'
    },

    headerTitle: {
        margin: 0,
        fontSize: '32px',
        fontWeight: '600',
        color: '#1a1a1a'
    },

    main: {
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '40px 20px'
    },

    statusMessage: {
        border: '1px solid',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '24px'
    },

    statusHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },

    statusIcon: {
        fontSize: '20px'
    },

    statusTitle: {
        margin: '0 0 4px 0',
        fontSize: '16px',
        fontWeight: '600'
    },

    statusMessage: {
        margin: 0,
        fontSize: '14px'
    },

    successDetails: {
        marginTop: '8px',
        fontSize: '14px',
        color: '#047857'
    },

    successDetailItem: {
        margin: '0 0 4px 0'
    },

    errorDetails: {
        marginTop: '8px'
    },

    errorSummary: {
        cursor: 'pointer',
        fontSize: '14px',
        color: '#dc2626'
    },

    errorPre: {
        backgroundColor: '#f3f4f6',
        padding: '8px',
        borderRadius: '4px',
        fontSize: '12px',
        marginTop: '8px',
        overflow: 'auto'
    },

    apiDoc: {
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e1e5e9',
        overflow: 'hidden',
        marginBottom: '40px'
    },

    apiDocHeader: {
        backgroundColor: '#f8f9fa',
        padding: '20px',
        borderBottom: '1px solid #e1e5e9'
    },

    apiDocTitle: {
        margin: 0,
        fontSize: '24px',
        fontWeight: '600',
        color: '#1a1a1a'
    },

    apiDocSubtitle: {
        margin: '8px 0 0 0',
        color: '#6b7280'
    },

    apiDocContent: {
        display: 'flex',
        minHeight: '600px'
    },

    apiDocLeft: {
        flex: 1,
        padding: '24px',
        borderRight: '1px solid #e1e5e9'
    },

    parametersTitle: {
        margin: '0 0 16px 0',
        fontSize: '18px',
        fontWeight: '600'
    },

    parameter: {
        marginBottom: '20px'
    },

    parameterName: {
        backgroundColor: '#f3f4f6',
        padding: '2px 6px',
        borderRadius: '4px',
        fontWeight: '600'
    },

    parameterBadge: {
        marginLeft: '8px'
    },

    parameterDescription: {
        margin: '4px 0 0 0',
        color: '#6b7280',
        fontSize: '14px'
    },

    apiDocRight: {
        flex: 1,
        backgroundColor: '#1f2937',
        padding: '24px',
        color: '#ffffff'
    },

    exampleTitle: {
        margin: '0 0 16px 0',
        fontSize: '18px',
        fontWeight: '600',
        color: '#ffffff'
    },

    curlExample: {
        backgroundColor: '#111827',
        padding: '16px',
        borderRadius: '6px',
        fontSize: '14px',
        lineHeight: '1.5',
        overflow: 'auto',
        margin: 0,
        fontFamily: 'Monaco, Menlo, monospace'
    },

    responseSection: {
        marginTop: '24px'
    },

    responseTitle: {
        fontSize: '16px',
        fontWeight: '600',
        margin: '0 0 12px 0',
        color: '#ffffff'
    },

    responseExample: {
        backgroundColor: '#111827',
        padding: '16px',
        borderRadius: '6px',
        fontSize: '14px',
        lineHeight: '1.5',
        overflow: 'auto',
        margin: 0,
        fontFamily: 'Monaco, Menlo, monospace'
    },

    syncSection: {
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e1e5e9',
        padding: '32px',
        textAlign: 'center'
    },

    syncTitle: {
        margin: '0 0 8px 0',
        fontSize: '20px',
        fontWeight: '600',
        color: '#1a1a1a'
    },

    syncSubtitle: {
        margin: '0 0 24px 0',
        color: '#6b7280',
        fontSize: '14px'
    },

    syncForm: {
        display: 'inline-block'
    },

    syncButton: {
        padding: '12px 24px',
        fontSize: '14px',
        fontWeight: '500',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        transition: 'background-color 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },

    spinner: {
        width: '16px',
        height: '16px',
        border: '2px solid #ffffff',
        borderTop: '2px solid transparent',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
    },

    loadingText: {
        marginTop: '16px',
        color: '#6b7280',
        fontSize: '14px'
    }
};