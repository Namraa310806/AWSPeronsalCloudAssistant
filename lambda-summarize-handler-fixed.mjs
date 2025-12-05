// ==========================================
// LAMBDA FUNCTION 3: SUMMARIZE HANDLER (.mjs) - FIXED VERSION
// ==========================================

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// Initialize clients
const s3Client = new S3Client({ region: 'ap-south-1' });
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' }); // Bedrock is available in us-east-1
const BUCKET_NAME = 'pca-files-namraa';

export const handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    // CORS headers for all responses
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Content-Type': 'application/json'
    };
    
    try {
        // Get HTTP method
        const method = event.httpMethod || event.requestContext?.http?.method;
        console.log('HTTP Method:', method);
        
        // Handle OPTIONS (preflight CORS request)
        if (method === 'OPTIONS') {
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: ''
            };
        }
        
        // Only handle POST requests
        if (method !== 'POST') {
            return {
                statusCode: 405,
                headers: corsHeaders,
                body: JSON.stringify({ 
                    error: `Method ${method} not allowed. Only POST is supported.`
                })
            };
        }
        
        // Safely get the body
        const bodyStr = event.body || '{}';
        console.log('Request body:', bodyStr);
        
        if (!bodyStr || bodyStr === '{}') {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Request body is required' })
            };
        }
        
        let requestData;
        try {
            requestData = JSON.parse(bodyStr);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Invalid JSON in request body' })
            };
        }
        
        const { type, content, fileKey } = requestData;
        
        if (!type || !content) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ 
                    error: 'type and content are required fields',
                    received: Object.keys(requestData)
                })
            };
        }
        
        let textToSummarize = '';
        
        // Handle different content types
        if (type === 'note') {
            // For notes, content is directly provided
            textToSummarize = content;
            console.log('Summarizing note content, length:', textToSummarize.length);
            
        } else if (type === 'file') {
            // For files, need to fetch from S3
            if (!fileKey) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'fileKey is required for file summarization' })
                };
            }
            
            try {
                console.log('Fetching file from S3:', fileKey);
                
                const command = new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: fileKey
                });
                
                const response = await s3Client.send(command);
                const fileBuffer = await streamToBuffer(response.Body);
                textToSummarize = fileBuffer.toString('utf-8');
                
                console.log('File content retrieved, length:', textToSummarize.length);
                
            } catch (error) {
                console.error('S3 fetch error:', error);
                return {
                    statusCode: 404,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: 'Failed to fetch file: ' + error.message 
                    })
                };
            }
            
        } else {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ 
                    error: 'Invalid type. Must be "note" or "file"',
                    received: type
                })
            };
        }
        
        // Validate content length
        if (!textToSummarize || textToSummarize.trim().length === 0) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Content is empty or invalid' })
            };
        }
        
        // Limit content length for API limits
        if (textToSummarize.length > 10000) {
            textToSummarize = textToSummarize.substring(0, 10000) + '... (truncated)';
        }
        
        try {
            // Use Claude 3 Haiku for summarization
            const prompt = `Please provide a concise summary of the following ${type}:

${textToSummarize}

Summary:`;
            
            const modelInput = {
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 500,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            };
            
            console.log('Calling Bedrock with model input');
            
            const command = new InvokeModelCommand({
                modelId: "anthropic.claude-3-haiku-20240307-v1:0",
                body: JSON.stringify(modelInput),
                contentType: "application/json",
                accept: "application/json"
            });
            
            const response = await bedrockClient.send(command);
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));
            
            console.log('Bedrock response:', responseBody);
            
            const summary = responseBody.content?.[0]?.text || 'Unable to generate summary';
            
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    summary: summary,
                    originalLength: textToSummarize.length,
                    type: type
                })
            };
            
        } catch (error) {
            console.error('Bedrock error:', error);
            
            // Fallback: Simple text summarization without AI
            const sentences = textToSummarize.split(/[.!?]+/).filter(s => s.trim().length > 10);
            const fallbackSummary = sentences.slice(0, 3).join('. ').trim() + '.';
            
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    summary: fallbackSummary + ' (Note: AI summarization unavailable, showing first few sentences)',
                    originalLength: textToSummarize.length,
                    type: type,
                    fallback: true
                })
            };
        }
            
    } catch (error) {
        console.error('Lambda error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ 
                error: 'Internal server error: ' + error.message,
                details: error.stack
            })
        };
    }
};

// Helper function to convert stream to buffer
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}