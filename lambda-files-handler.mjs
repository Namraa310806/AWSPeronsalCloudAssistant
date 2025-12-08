// ==========================================
// LAMBDA FUNCTION 2: FILES HANDLER (.mjs)
// ==========================================

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

// Initialize clients
const s3Client = new S3Client({ region: 'ap-south-1' });
const cloudwatchClient = new CloudWatchClient({ region: 'ap-south-1' });
const BUCKET_NAME = 'pca-files-namraa';
const NAMESPACE = 'PersonalCloudAssistant/Files';

export const handler = async (event, context) => {
    const startTime = Date.now();
    const requestId = context?.requestId || `req-${Date.now()}`;
    let operationType = 'unknown';
    
    console.log(`[${requestId}] [START] Received event:`, JSON.stringify(event, null, 2));

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Content-Type': 'application/json'
    };

    // Helper function to send metrics to CloudWatch
    const sendMetric = async (metricName, value, unit = 'Count') => {
        try {
            await cloudwatchClient.send(new PutMetricDataCommand({
                Namespace: NAMESPACE,
                MetricData: [
                    {
                        MetricName: metricName,
                        Value: value,
                        Unit: unit,
                        Timestamp: new Date(),
                        Dimensions: [
                            { Name: 'Environment', Value: 'production' },
                            { Name: 'OperationType', Value: operationType }
                        ]
                    }
                ]
            }));
        } catch (err) {
            console.error(`[${requestId}] Failed to send metric ${metricName}:`, err);
        }
    };

    try {
        const method = event.httpMethod || event.requestContext?.http?.method;
        const path = event.path || event.rawPath || '';
        const pathParameters = event.pathParameters || {};
        const queryParameters = event.queryStringParameters || {};

        console.log(`[${requestId}] Method: ${method}, Path: ${path}`);

        if (method === 'OPTIONS') {
            return { statusCode: 200, headers: corsHeaders, body: '' };
        }

            const userId = event?.requestContext?.authorizer?.jwt?.claims?.sub
                || event?.requestContext?.authorizer?.claims?.sub
                || event?.requestContext?.authorizer?.claims?.["cognito:username"];

            if (!userId) {
                console.error(`[${requestId}] Missing authenticated user`);
                return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
            }

        // GET /files
        if (method === 'GET' && (path === '/files' || path.endsWith('/files'))) {
            operationType = 'LIST_FILES';
            console.log(`[${requestId}] Listing files for user: ${userId}`);
            
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

            const duration = Date.now() - startTime;
            await sendMetric('RequestDuration', duration, 'Milliseconds');
            await sendMetric('FilesListed', files.length, 'Count');
            
            console.log(`[${requestId}] [SUCCESS] Listed ${files.length} files in ${duration}ms`);
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(files) };
        }

        // GET /files/{id}/download
        if (method === 'GET' && path.includes('download')) {
            operationType = 'DOWNLOAD_FILE';
            const fileId = pathParameters.fileId || queryParameters.id;
            if (!fileId) {
                await sendMetric('Errors', 1, 'Count');
                console.error(`[${requestId}] File ID is required`);
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'File ID is required' }) };
            }

            const fileKey = `users/${userId}/${fileId}`;
            console.log(`[${requestId}] Generating presigned URL for: ${fileKey}`);
            
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: fileKey,
                ResponseContentDisposition: `attachment; filename="${fileId}"`
            });
            const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
            
            const duration = Date.now() - startTime;
            await sendMetric('RequestDuration', duration, 'Milliseconds');
            
            console.log(`[${requestId}] [SUCCESS] Generated presigned URL in ${duration}ms`);
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ downloadUrl: presignedUrl, fileName: fileId }) };
        }

        // POST /files
        if (method === 'POST' && (path === '/files' || path.endsWith('/files'))) {
            operationType = 'UPLOAD_FILE';
            const bodyStr = event.body || '{}';
            let data;
            try {
                data = JSON.parse(bodyStr);
            } catch (err) {
                await sendMetric('Errors', 1, 'Count');
                console.error(`[${requestId}] JSON parse error:`, err);
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON in request body' }) };
            }

            if (!data.fileName || !data.fileContent) {
                await sendMetric('Errors', 1, 'Count');
                console.error(`[${requestId}] Missing required fields: fileName or fileContent`);
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'fileName and fileContent are required' }) };
            }

            const timestamp = Date.now();
            const fileExtension = data.fileName.includes('.') ? data.fileName.split('.').pop() : 'txt';
            const baseName = data.fileName.replace(/\.[^/.]+$/, "");
            const uniqueFileName = `${timestamp}-${baseName}.${fileExtension}`;
            const fileKey = `users/${userId}/${uniqueFileName}`;

            const fileBuffer = data.isBase64 ? Buffer.from(data.fileContent, 'base64') : Buffer.from(data.fileContent, 'utf8');

            console.log(`[${requestId}] Uploading file: ${uniqueFileName}, Size: ${fileBuffer.length} bytes`);

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

            const duration = Date.now() - startTime;
            await sendMetric('RequestDuration', duration, 'Milliseconds');
            await sendMetric('FileUploadSize', fileBuffer.length, 'Bytes');
            await sendMetric('FilesUploaded', 1, 'Count');
            
            console.log(`[${requestId}] [SUCCESS] File uploaded in ${duration}ms`);
            return { statusCode: 201, headers: corsHeaders, body: JSON.stringify({ message: 'File uploaded successfully', file: fileInfo }) };
        }

        // DELETE /files/{id}
        if (method === 'DELETE' && (path.includes('/files/') || path.endsWith('/files'))) {
            operationType = 'DELETE_FILE';
            const fileId = pathParameters.fileId || pathParameters.id || (path.split('/').pop() || '').trim();
            if (!fileId) {
                await sendMetric('Errors', 1, 'Count');
                console.error(`[${requestId}] File ID is required`);
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'File ID is required' }) };
            }

            const fileKey = `users/${userId}/${fileId}`;
            console.log(`[${requestId}] Deleting file: ${fileKey}`);
            
            const command = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey });
            await s3Client.send(command);
            
            const duration = Date.now() - startTime;
            await sendMetric('RequestDuration', duration, 'Milliseconds');
            await sendMetric('FilesDeleted', 1, 'Count');
            
            console.log(`[${requestId}] [SUCCESS] File deleted in ${duration}ms`);
            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'File deleted successfully', fileId }) };
        }

        await sendMetric('Errors', 1, 'Count');
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: `Method ${method} not allowed` }) };

    } catch (error) {
        const duration = Date.now() - startTime;
        await sendMetric('Errors', 1, 'Count');
        await sendMetric('RequestDuration', duration, 'Milliseconds');
        
        console.error(`[${requestId}] [ERROR] Unexpected error after ${duration}ms:`, error);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error: ' + error.message }) };
    }
};