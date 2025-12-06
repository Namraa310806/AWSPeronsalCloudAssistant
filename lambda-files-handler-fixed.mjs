// ==========================================
// LAMBDA FUNCTION 2: FILES HANDLER (.mjs) - FIXED VERSION
// ==========================================

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Initialize S3 client
const s3Client = new S3Client({ region: 'ap-south-1' });
const BUCKET_NAME = 'pca-files-namraa';

export const handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Content-Type': 'application/json'
    };

    try {
        const method = event.httpMethod || event.requestContext?.http?.method;
        const path = event.path || event.rawPath || '';
        const pathParameters = event.pathParameters || {};
        const queryParameters = event.queryStringParameters || {};

        console.log('Method:', method, 'Path:', path);

        if (method === 'OPTIONS') {
            return { statusCode: 200, headers: corsHeaders, body: '' };
        }

        const userId = 'test-user';

        // GET /files
        if (method === 'GET' && (path === '/files' || path.endsWith('/files'))) {
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

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(files) };
        }

        // GET /files/{id}/download
        if (method === 'GET' && path.includes('download')) {
            const fileId = pathParameters.fileId || queryParameters.id;
            if (!fileId) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'File ID is required' }) };
            }

            const fileKey = `users/${userId}/${fileId}`;
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: fileKey,
                ResponseContentDisposition: `attachment; filename="${fileId}"`
            });
            const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ downloadUrl: presignedUrl, fileName: fileId }) };
        }

        // POST /files
        if (method === 'POST' && (path === '/files' || path.endsWith('/files'))) {
            const bodyStr = event.body || '{}';
            let data;
            try {
                data = JSON.parse(bodyStr);
            } catch (err) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON in request body' }) };
            }

            if (!data.fileName || !data.fileContent) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'fileName and fileContent are required' }) };
            }

            const timestamp = Date.now();
            const fileExtension = data.fileName.includes('.') ? data.fileName.split('.').pop() : 'txt';
            const baseName = data.fileName.replace(/\.[^/.]+$/, "");
            const uniqueFileName = `${timestamp}-${baseName}.${fileExtension}`;
            const fileKey = `users/${userId}/${uniqueFileName}`;

            const fileBuffer = data.isBase64 ? Buffer.from(data.fileContent, 'base64') : Buffer.from(data.fileContent, 'utf8');

            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: fileKey,
                Body: fileBuffer,
                ContentType: data.contentType || 'application/octet-stream'
            });

            await s3Client.send(command);

            const fileInfo = {
                id: uniqueFileName,
                name: data.fileName,
                size: fileBuffer.length,
                uploadedAt: new Date().toISOString(),
                key: fileKey,
                type: fileExtension
            };

            return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ message: 'File uploaded successfully', file: fileInfo }) };
        }

        // DELETE /files/{id}
        if (method === 'DELETE' && (path.includes('/files/') || path.endsWith('/files'))) {
            const fileId = pathParameters.fileId || pathParameters.id || (path.split('/').pop() || '').trim();
            if (!fileId) {
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'File ID is required' }) };
            }

            const fileKey = `users/${userId}/${fileId}`;
            const command = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey });
            await s3Client.send(command);
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'File deleted successfully', fileId }) };
        }

        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: `Method ${method} not allowed` }) };

    } catch (error) {
        console.error('Unexpected Lambda error:', error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error: ' + error.message }) };
    }
};