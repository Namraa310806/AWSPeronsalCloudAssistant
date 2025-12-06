// ==========================================
// LAMBDA FUNCTION 1: NOTES HANDLER (.mjs) - ENHANCED WITH MONITORING
// ==========================================

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { randomUUID } from 'crypto';

// Initialize clients
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const cloudwatchClient = new CloudWatchClient({ region: 'ap-south-1' });
const TABLE_NAME = 'Notes';
const NAMESPACE = 'PersonalCloudAssistant/Notes';

export const handler = async (event, context) => {
    const startTime = Date.now();
    const requestId = context?.requestId || `req-${Date.now()}`;
    let operationType = 'unknown';
    
    console.log(`[${requestId}] [START] Received event:`, JSON.stringify(event, null, 2));
    
    // CORS headers for all responses
    const headers = {
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
        // Get HTTP method
        const method = event.httpMethod || event.requestContext?.http?.method;
        console.log(`[${requestId}] HTTP Method: ${method}`);
        
        // Handle OPTIONS (preflight CORS request)
        if (method === 'OPTIONS') {
            return {
                statusCode: 200,
                headers: headers,
                body: ''
            };
        }
        
        // Handle GET - Fetch notes from DynamoDB
        if (method === 'GET') {
            operationType = 'LIST_NOTES';
            console.log(`[${requestId}] Listing notes for user: test-user`);
            
            const command = new ScanCommand({
                TableName: TABLE_NAME,
                FilterExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': 'test-user'
                }
            });
            
            const response = await docClient.send(command);
            const notes = response.Items || [];
            
            // Sort by creation date (newest first)
            notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            // Add id field for frontend compatibility
            const notesWithId = notes.map(note => ({
                ...note,
                id: note.noteId
            }));
            
            const duration = Date.now() - startTime;
            await sendMetric('RequestDuration', duration, 'Milliseconds');
            await sendMetric('NotesListed', notes.length, 'Count');
            
            console.log(`[${requestId}] [SUCCESS] Retrieved ${notes.length} notes in ${duration}ms`);
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify(notesWithId)
            };
        }
        
        // Handle POST - Create new note
        if (method === 'POST') {
            operationType = 'CREATE_NOTE';
            const bodyStr = event.body || '{}';
            console.log(`[${requestId}] Request body:`, bodyStr);
            
            if (!bodyStr || bodyStr === '{}') {
                await sendMetric('Errors', 1, 'Count');
                console.error(`[${requestId}] Request body is required`);
                return {
                    statusCode: 400,
                    headers: headers,
                    body: JSON.stringify({ error: 'Request body is required' })
                };
            }
            
            let body;
            try {
                body = JSON.parse(bodyStr);
            } catch (parseError) {
                await sendMetric('Errors', 1, 'Count');
                console.error(`[${requestId}] JSON parse error:`, parseError);
                return {
                    statusCode: 400,
                    headers: headers,
                    body: JSON.stringify({ error: 'Invalid JSON in request body' })
                };
            }
            
            // Validate required fields
            const title = (body.title || '').trim();
            const content = body.content || '';
            
            if (!title) {
                await sendMetric('Errors', 1, 'Count');
                console.error(`[${requestId}] Title is required`);
                return {
                    statusCode: 400,
                    headers: headers,
                    body: JSON.stringify({ error: 'Title is required' })
                };
            }
            
            // Create new note and save to DynamoDB
            const newNote = {
                noteId: randomUUID(),
                title: title,
                content: content,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                userId: 'test-user'
            };
            
            console.log(`[${requestId}] Creating note:`, newNote.noteId);
            
            // Save to DynamoDB
            const command = new PutCommand({
                TableName: TABLE_NAME,
                Item: newNote
            });
            
            await docClient.send(command);
            
            const duration = Date.now() - startTime;
            await sendMetric('RequestDuration', duration, 'Milliseconds');
            await sendMetric('NotesCreated', 1, 'Count');
            
            console.log(`[${requestId}] [SUCCESS] Note created in ${duration}ms`);
            
            return {
                statusCode: 201,
                headers: headers,
                body: JSON.stringify({
                    message: 'Note created successfully',
                    note: { ...newNote, id: newNote.noteId }
                })
            };
        }
        
        // Handle DELETE - Remove note by id
        if (method === 'DELETE') {
            operationType = 'DELETE_NOTE';
            const pathParams = event.pathParameters || {};
            const noteId = pathParams.id || pathParams.noteId;
            console.log(`[${requestId}] Delete request for noteId:`, noteId);

            if (!noteId) {
                await sendMetric('Errors', 1, 'Count');
                console.error(`[${requestId}] noteId is required in the path`);
                return {
                    statusCode: 400,
                    headers: headers,
                    body: JSON.stringify({ error: 'noteId is required in the path' })
                };
            }

            const command = new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { noteId }
            });

            await docClient.send(command);
            
            const duration = Date.now() - startTime;
            await sendMetric('RequestDuration', duration, 'Milliseconds');
            await sendMetric('NotesDeleted', 1, 'Count');
            
            console.log(`[${requestId}] [SUCCESS] Note deleted in ${duration}ms`);

            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({ message: 'Note deleted successfully', noteId })
            };
        }

        await sendMetric('Errors', 1, 'Count');
        return {
            statusCode: 405,
            headers: headers,
            body: JSON.stringify({ error: `Method ${method} not allowed` })
        };
            
    } catch (error) {
        const duration = Date.now() - startTime;
        await sendMetric('Errors', 1, 'Count');
        await sendMetric('RequestDuration', duration, 'Milliseconds');
        
        console.error(`[${requestId}] [ERROR] Unexpected error after ${duration}ms:`, error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ 
                error: 'Internal server error: ' + error.message
            })
        };
    }
};
