// ==========================================
// LAMBDA FUNCTION 2: FILES HANDLER (.mjs) - FIXED VERSION
// ==========================================

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Initialize S3 client
const s3Client = new S3Client({ region: 'ap-south-1' });
const BUCKET_NAME = 'pca-files-namraa';

export const handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    // CORS headers for all responses
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Content-Type': 'application/json'
    };
    
    try {
        // Get HTTP method and path
        const method = event.httpMethod || event.requestContext?.http?.method;
        const path = event.path || event.rawPath || '';
        const pathParameters = event.pathParameters || {};
        const queryParameters = event.queryStringParameters || {};
        
        console.log('Method:', method, 'Path:', path);
        
        // Handle OPTIONS (preflight CORS request)
        if (method === 'OPTIONS') {
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: ''
            };
        }
        
        // Get user ID (using test-user for now)
        const userId = "test-user";
        
        // Handle GET /files - List user's files
        if (method === 'GET' && (path === '/files' || path.endsWith('/files'))) {
            try {
                console.log('Listing files for user:', userId);
                
                const command = new ListObjectsV2Command({
                    Bucket: BUCKET_NAME,
                    Prefix: `users/${userId}/`
                });
                
                const response = await s3Client.send(command);
                const files = (response.Contents || []).map(file => ({
                    id: file.Key.split('/').pop(),
                    name: file.Key.split('/').pop(),
                    size: file.Size,
                    uploadedAt: file.LastModified.toISOString(),
                    key: file.Key,
                    type: file.Key.split('.').pop()
                }));
                
                console.log(`Found ${files.length} files for user`);
                
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify(files)
                };
                
            } catch (error) {
                console.error('S3 list error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: 'Failed to list files: ' + error.message
                    })
                };
            }
        }
        
        // Handle GET /files/{fileId}/download - Download file
        else if (method === 'GET' && path.includes('download')) {
            const fileId = pathParameters.fileId || queryParameters.id;
            
            if (!fileId) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'File ID is required' })
                };
            }
            
            try {
                const fileKey = `users/${userId}/${fileId}`;
                console.log('Generating download URL for:', fileKey);
                
                // Generate presigned URL for download
                const command = new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: fileKey
                });
                
                const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
                
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        downloadUrl: presignedUrl,
                        message: 'Use the downloadUrl to download the file'
                    })
                };
                
            } catch (error) {
                console.error('S3 download error:', error);
                return {
                    statusCode: 404,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: 'File not found: ' + error.message 
                    })
                };
            }
        }
        
        // Handle POST /files - Upload file
        else if (method === 'POST' && (path === '/files' || path.endsWith('/files'))) {
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
            
            let data;
            try {
                data = JSON.parse(bodyStr);
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Invalid JSON in request body' })
                };
            }
            
            // Validate required fields
            if (!data.fileName || !data.fileContent) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: 'fileName and fileContent are required',
                        received: Object.keys(data)
                    })
                };
            }
            
            try {
                // Generate unique file key
                const timestamp = Date.now();
                const fileExtension = data.fileName.includes('.') ? 
                    data.fileName.split('.').pop() : 'txt';
                const baseName = data.fileName.replace(/\.[^/.]+$/, "");
                const uniqueFileName = `${timestamp}-${baseName}.${fileExtension}`;
                const fileKey = `users/${userId}/${uniqueFileName}`;
                
                console.log('Uploading file:', uniqueFileName, 'to key:', fileKey);
                
                // Decode base64 content if needed
                let fileBuffer;
                if (data.isBase64) {
                    fileBuffer = Buffer.from(data.fileContent, 'base64');
                } else {
                    fileBuffer = Buffer.from(data.fileContent, 'utf8');
                }
                
                console.log('File buffer size:', fileBuffer.length);
                
                // Upload to S3 (removed metadata to avoid header issues)
                const command = new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: fileKey,
                    Body: fileBuffer,
                    ContentType: data.contentType || 'application/octet-stream'
                });
                
                const result = await s3Client.send(command);
                console.log('S3 upload result:', result);
                
                const fileInfo = {
                    id: uniqueFileName,
                    name: data.fileName,
                    size: fileBuffer.length,
                    uploadedAt: new Date().toISOString(),
                    key: fileKey,
                    type: fileExtension
                };
                
                return {
                    statusCode: 201,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        message: 'File uploaded successfully',
                        file: fileInfo
                    })
                };
                
            } catch (error) {
                console.error('S3 upload error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({ 
                        error: 'Failed to upload file: ' + error.message,
                        details: error.stack
                    })
                };
            }
        }
        
        else {
            return {
                statusCode: 405,
                headers: corsHeaders,
                body: JSON.stringify({ 
                    error: `Method ${method} not allowed for path ${path}`,
                    allowedMethods: ['GET', 'POST', 'OPTIONS']
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