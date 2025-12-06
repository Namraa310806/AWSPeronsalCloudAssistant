import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

// Initialize DynamoDB Document Client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'Notes';

export const handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    // CORS headers for all responses
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
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
                headers: headers,
                body: ''
            };
        }
        
        // Handle GET - Fetch notes from DynamoDB
        if (method === 'GET') {
            try {
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
                
                console.log(`Found ${notes.length} notes for user`);
                
                return {
                    statusCode: 200,
                    headers: headers,
                    body: JSON.stringify(notesWithId)
                };
                
            } catch (error) {
                console.error('DynamoDB scan error:', error);
                return {
                    statusCode: 500,
                    headers: headers,
                    body: JSON.stringify({ error: 'Failed to fetch notes: ' + error.message })
                };
            }
        }
        
        // Handle POST - Create new note
        else if (method === 'POST') {
            // Safely get the body
            const bodyStr = event.body || '{}';
            console.log('Request body:', bodyStr);
            
            if (!bodyStr || bodyStr === '{}') {
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
                console.error('JSON parse error:', parseError);
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
                return {
                    statusCode: 400,
                    headers: headers,
                    body: JSON.stringify({ error: 'Title is required' })
                };
            }
            
            // Create new note and save to DynamoDB
            const newNote = {
                noteId: crypto.randomUUID(),
                title: title,
                content: content,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                userId: 'test-user'
            };
            
            try {
                // Save to DynamoDB
                const command = new PutCommand({
                    TableName: TABLE_NAME,
                    Item: newNote
                });
                
                await docClient.send(command);
                console.log('Note saved to DynamoDB:', newNote);
                
                return {
                    statusCode: 201,
                    headers: headers,
                    body: JSON.stringify({
                        message: 'Note created successfully',
                        note: { ...newNote, id: newNote.noteId } // Include both for compatibility
                    })
                };
                
            } catch (error) {
                console.error('DynamoDB put error:', error);
                return {
                    statusCode: 500,
                    headers: headers,
                    body: JSON.stringify({ error: 'Failed to save note: ' + error.message })
                };
            }
        }
        
        // Handle DELETE - Remove note by id
        else if (method === 'DELETE') {
            const pathParams = event.pathParameters || {};
            const noteId = pathParams.id || pathParams.noteId;
            console.log('Delete request for noteId:', noteId, 'pathParameters:', pathParams);

            if (!noteId) {
                return {
                    statusCode: 400,
                    headers: headers,
                    body: JSON.stringify({ error: 'noteId is required in the path' })
                };
            }

            try {
                const command = new DeleteCommand({
                    TableName: TABLE_NAME,
                    Key: { noteId }
                });

                await docClient.send(command);
                console.log('Deleted noteId:', noteId);

                return {
                    statusCode: 200,
                    headers: headers,
                    body: JSON.stringify({ message: 'Note deleted successfully', noteId })
                };

            } catch (error) {
                console.error('DynamoDB delete error:', error);
                return {
                    statusCode: 500,
                    headers: headers,
                    body: JSON.stringify({ error: 'Failed to delete note: ' + error.message })
                };
            }
        }

        else {
            return {
                statusCode: 405,
                headers: headers,
                body: JSON.stringify({ error: `Method ${method} not allowed` })
            };
        }
            
    } catch (error) {
        console.error('Lambda error:', error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ 
                error: 'Internal server error: ' + error.message,
                details: error.stack 
            })
        };
    }
};