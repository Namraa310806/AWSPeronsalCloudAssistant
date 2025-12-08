// ==========================================
// LAMBDA FUNCTION 3: SUMMARIZE HANDLER (.mjs) - OPENAI POWERED
// ==========================================

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";
import { inflateSync } from "zlib";
import https from "https";

// Initialize clients
const s3Client = new S3Client({ region: 'ap-south-1' });
const cloudwatchClient = new CloudWatchClient({ region: 'ap-south-1' });
const textractClient = new TextractClient({ region: 'ap-south-1' });
const BUCKET_NAME = 'pca-files-namraa';
const NAMESPACE = 'PersonalCloudAssistant/Summarize';
const PDF_MAGIC = '%PDF';
const MAX_CONTENT_CHARS = 14000; // OpenAI can handle more tokens
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = 'gpt-3.5-turbo';

export const handler = async (event, context) => {
    if (context) {
        context.callbackWaitsForEmptyEventLoop = false;
    }

    const startTime = Date.now();
    const requestId = context?.requestId || `req-${Date.now()}`;
    let operationType = 'SUMMARIZE';
    let lastText = '';

    console.log(`[${requestId}] [START] Received event:`, JSON.stringify(event, null, 2));

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Content-Type': 'application/json'
    };

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
                            { Name: 'SummaryType', Value: operationType }
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
        console.log(`[${requestId}] HTTP Method: ${method}`);

        const userId = event?.requestContext?.authorizer?.jwt?.claims?.sub
            || event?.requestContext?.authorizer?.claims?.sub
            || event?.requestContext?.authorizer?.claims?.["cognito:username"];

        if (!userId) {
            await sendMetric('Errors', 1, 'Count');
            return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        if (method === 'OPTIONS') {
            return { statusCode: 200, headers: corsHeaders, body: '' };
        }
        if (method !== 'POST') {
            await sendMetric('Errors', 1, 'Count');
            return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: `Method ${method} not allowed. Only POST is supported.` }) };
        }

        const bodyStr = event.body || '{}';
        console.log(`[${requestId}] Request body:`, bodyStr);
        if (!bodyStr || bodyStr === '{}') {
            await sendMetric('Errors', 1, 'Count');
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Request body is required' }) };
        }

        let requestData;
        try {
            requestData = JSON.parse(bodyStr);
        } catch (parseError) {
            await sendMetric('Errors', 1, 'Count');
            console.error(`[${requestId}] JSON parse error:`, parseError);
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON in request body' }) };
        }

        const { type, content, fileKey, summaryType = 'brief' } = requestData;
        operationType = `SUMMARIZE_${summaryType.toUpperCase()}`;

        if (!type || !content) {
            await sendMetric('Errors', 1, 'Count');
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'type and content are required fields', received: Object.keys(requestData) }) };
        }

        let textToSummarize = '';

        let fileBuffer = null;

        if (type === 'note') {
            textToSummarize = content;
            console.log(`[${requestId}] Summarizing note content, length:`, textToSummarize.length);
        } else if (type === 'file') {
            if (!fileKey) {
                await sendMetric('Errors', 1, 'Count');
                return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'fileKey is required for file summarization' }) };
            }
            if (!fileKey.startsWith(`users/${userId}/`)) {
                await sendMetric('Errors', 1, 'Count');
                return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Access denied for this file' }) };
            }
            try {
                console.log(`[${requestId}] Fetching file from S3:`, fileKey);
                const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey });
                const response = await s3Client.send(command);
                fileBuffer = await streamToBuffer(response.Body);
                const isPdf = fileBuffer.slice(0, 4).toString('ascii') === PDF_MAGIC;
                try {
                    if (isPdf) {
                        console.log(`[${requestId}] PDF detected; extracting text`);
                        textToSummarize = extractTextFromPdfBuffer(fileBuffer);
                    } else {
                        textToSummarize = fileBuffer.toString('utf-8');
                    }
                } catch (extractErr) {
                    console.error(`[${requestId}] Extraction error:`, extractErr);
                    textToSummarize = fileBuffer.toString('utf-8');
                }
                console.log(`[${requestId}] File content retrieved, length:`, textToSummarize.length);
            } catch (error) {
                await sendMetric('Errors', 1, 'Count');
                console.error(`[${requestId}] S3 fetch error:`, error);
                return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to fetch file: ' + error.message }) };
            }
        } else {
            await sendMetric('Errors', 1, 'Count');
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid type. Must be "note" or "file"', received: type }) };
        }

        if (!textToSummarize || textToSummarize.trim().length === 0) {
            await sendMetric('Errors', 1, 'Count');
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Content is empty or invalid. PDF text extraction may have failed; try uploading a text file.' }) };
        }

        // If the raw text looks low-quality (scanned or mostly gibberish), OCR with Textract
        if (type === 'file' && fileBuffer) {
            const quality = scoreTextQuality(textToSummarize);
            if (quality.score < 0.25 || textToSummarize.trim().length < 200) {
                try {
                    console.log(`[${requestId}] Low-quality text detected (score=${quality.score.toFixed(2)}, len=${textToSummarize.length}); attempting Textract OCR`);
                    const ocrText = await extractWithTextract(fileBuffer);
                    if (ocrText && ocrText.trim().length > 0) {
                        textToSummarize = ocrText;
                        console.log(`[${requestId}] Textract OCR succeeded, length: ${textToSummarize.length}`);
                    }
                } catch (ocrErr) {
                    console.error(`[${requestId}] Textract OCR failed:`, ocrErr);
                }
            }
        }

        textToSummarize = sanitizeText(textToSummarize);
        if (!textToSummarize || textToSummarize.trim().length === 0) {
            await sendMetric('Errors', 1, 'Count');
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Extracted text is not readable. Try converting the PDF to text or upload a clearer file.' }) };
        }
        const postCleanQuality = scoreTextQuality(textToSummarize);
        if (postCleanQuality.score < 0.10 || textToSummarize.split(/\s+/).length < 10) {
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    summary: 'Text not readable; PDF appears scanned or garbled. Please upload a clearer copy.',
                    source: 'fallback',
                    warning: 'Unreadable text after extraction and cleaning'
                })
            };
        }
        lastText = textToSummarize;

        if (textToSummarize.length > MAX_CONTENT_CHARS) {
            textToSummarize = textToSummarize.substring(0, MAX_CONTENT_CHARS) + '... (truncated)';
        }

        // Use OpenAI for summarization
        try {
            console.log(`[${requestId}] Calling OpenAI API for summarization with type: ${summaryType}`);
            
            if (!OPENAI_API_KEY) {
                throw new Error('OpenAI API key not configured');
            }

            const openaiSummary = await callOpenAI(textToSummarize, summaryType, requestId);
            
            if (openaiSummary) {
                const duration = Date.now() - startTime;
                await sendMetric('RequestDuration', duration, 'Milliseconds');
                await sendMetric('SummariesGenerated', 1, 'Count');
                await sendMetric('ContentLength', textToSummarize.length, 'Bytes');

                console.log(`[${requestId}] [SUCCESS] Summary generated in ${duration}ms`);

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        summary: openaiSummary,
                        originalLength: textToSummarize.length,
                        type,
                        summaryType,
                        model: OPENAI_MODEL,
                        source: 'openai'
                    })
                };
            } else {
                throw new Error('OpenAI API returned empty response');
            }

        } catch (error) {
            console.error(`[${requestId}] OpenAI error:`, error);
            
            // Fallback to text extraction if OpenAI fails
            const sentences = textToSummarize.split(/[.!?]+/).filter(s => s.trim().length > 15);
            
            if (sentences.length === 0) {
                const fallbackSummary = 'Unable to generate meaningful summary - document content is too short or unclear.';
                const duration = Date.now() - startTime;
                await sendMetric('RequestDuration', duration, 'Milliseconds');
                await sendMetric('SummariesFallback', 1, 'Count');
                
                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        summary: fallbackSummary,
                        originalLength: textToSummarize.length,
                        type,
                        summaryType,
                        source: 'fallback'
                    })
                };
            }

            // Take first 3-5 substantial sentences to form a coherent summary
            const numSentences = Math.min(Math.max(2, Math.ceil(sentences.length / 4)), 5);
            const fallbackSummary = sentences.slice(0, numSentences).map(s => s.trim()).join('. ').trim() + '.';

            const duration = Date.now() - startTime;
            await sendMetric('RequestDuration', duration, 'Milliseconds');
            await sendMetric('SummariesFallback', 1, 'Count');

            console.log(`[${requestId}] [FALLBACK] Using fallback summarizer after ${duration}ms`);

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    summary: fallbackSummary,
                    originalLength: textToSummarize.length,
                    type,
                    summaryType,
                    source: 'fallback'
                })
            };
        }

    } catch (error) {
        const duration = Date.now() - startTime;
        await sendMetric('Errors', 1, 'Count');
        await sendMetric('RequestDuration', duration, 'Milliseconds');

        console.error(`[${requestId}] [ERROR] Unexpected error after ${duration}ms:`, error);
        
        let fallbackSummary = 'Summary unavailable due to an unexpected error.';
        
        // Try to provide intelligent fallback from lastText if available
        if (lastText && lastText.trim().length > 50) {
            const sentences = lastText.split(/[.!?]+/).filter(s => s.trim().length > 15);
            if (sentences.length > 0) {
                const numSentences = Math.min(Math.max(2, Math.ceil(sentences.length / 4)), 4);
                fallbackSummary = sentences.slice(0, numSentences).map(s => s.trim()).join('. ').trim() + '.';
            }
        }
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                summary: fallbackSummary,
                source: 'fallback'
            })
        };
    }
};

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function extractTextFromPdfBuffer(buffer) {
    const textParts = [];
    const raw = buffer.toString('latin1');

    let idx = 0;
    while (idx < raw.length) {
        const streamPos = raw.indexOf('stream', idx);
        if (streamPos === -1) break;
        const start = raw.indexOf('\n', streamPos);
        if (start === -1) break;
        const endStreamPos = raw.indexOf('endstream', start);
        if (endStreamPos === -1) break;
        const streamContent = buffer.slice(start + 1, endStreamPos);
        let inflated = null;
        try {
            inflated = inflateSync(streamContent);
        } catch (e) {
            // not flate
        }
        const candidate = inflated ? inflated.toString('latin1') : streamContent.toString('latin1');
        const textObjects = candidate.match(/\((?:\\.|[^\\)])*\)/g) || [];
        textObjects.forEach(obj => {
            const cleaned = obj
                .slice(1, -1)
                .replace(/\\n/g, ' ')
                .replace(/\\r/g, ' ')
                .replace(/\\t/g, ' ')
                .replace(/\\f/g, ' ')
                .replace(/\\\\/g, '\\')
                .replace(/\s+/g, ' ')
                .trim();
            if (cleaned.length > 0) {
                textParts.push(cleaned);
            }
        });
        idx = endStreamPos + 9; // length of 'endstream'
    }

    if (textParts.length === 0) {
        const matches = raw.match(/[\x20-\x7E]{5,}/g) || [];
        matches.forEach(m => {
            const cleaned = m.replace(/\s+/g, ' ').trim();
            if (cleaned.length > 0) {
                textParts.push(cleaned);
            }
        });
    }

    const combined = textParts.join(' ').slice(0, 12000);
    return combined;
}

function scoreTextQuality(text) {
    const total = text.length || 1;
    const letters = (text.match(/[A-Za-z]/g) || []).length;
    const vowels = (text.match(/[AEIOUaeiou]/g) || []).length;
    const words = text.split(/\s+/).filter(Boolean).length;
    const lettersRatio = letters / total;
    const vowelRatio = letters > 0 ? vowels / letters : 0;
    const wordScore = Math.min(words / 80, 1);
    const score = (0.5 * lettersRatio) + (0.3 * vowelRatio) + (0.2 * wordScore);
    return { score, lettersRatio, vowelRatio, words };
}

async function extractWithTextract(fileBuffer) {
    const command = new DetectDocumentTextCommand({
        Document: { Bytes: fileBuffer }
    });
    const response = await textractClient.send(command);
    const blocks = response.Blocks || [];
    const lines = blocks
        .filter(b => b.BlockType === 'LINE' && b.Text)
        .map(b => b.Text.trim())
        .filter(Boolean);
    return lines.join(' ');
}

function sanitizeText(text) {
    // Remove non-ASCII/control noise and collapse whitespace
    const cleaned = text
        .replace(/[^\x20-\x7E]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const tokens = cleaned.split(' ');
    const filtered = tokens.filter(tok => {
        const hasLetter = /[A-Za-z]/.test(tok);
        const hasVowel = /[AEIOUaeiou]/.test(tok);
        if (!hasLetter) return false;
        if (!hasVowel && tok.length > 5) return false;
        if (tok.length > 60) return false;
        return true;
    });
    const result = filtered.join(' ').trim();
    return result.length > 12000 ? result.slice(0, 12000) : result;
}

async function callOpenAI(text, summaryType, requestId) {
    if (!OPENAI_API_KEY) {
        console.log(`[${requestId}] OpenAI API key not configured`);
        return null;
    }

    console.log(`[${requestId}] OpenAI API key is configured, proceeding with API call`);
    console.log(`[${requestId}] Text length to summarize: ${text.length} characters`);

    const prompts = {
        'brief': `Read and analyze the following document text carefully. Provide a clear, accurate 2-3 sentence summary that explains what the document is about and its main points. Only use information from the text provided:\n\n${text}`,
        'detailed': `Read and analyze the following document text carefully. Provide:\n1. A 2-3 sentence overview of what the document discusses\n2. 5-7 bullet points covering the main topics and key information\n\nOnly use information from the text provided:\n\n${text}`,
        'bullet': `Read the following document and create 6-8 clear bullet points that summarize:\n- The document type and purpose\n- Main topics covered\n- Key information and details\n\nOnly use information from the text:\n\n${text}`,
        'sentiment': `Read the following document and provide:\n1. A 2-3 sentence summary of the content\n2. The overall tone (positive, negative, neutral, professional, casual, etc.)\n\nOnly use information from the text:\n\n${text}`,
        'technical': `Read the following technical document and provide:\n1. A 2-3 sentence overview\n2. 5-7 technical bullet points covering systems, procedures, specifications, and key details\n\nOnly use information from the text:\n\n${text}`
    };

    const userPrompt = prompts[summaryType] || prompts['brief'];

    console.log(`[${requestId}] Using summary type: ${summaryType}`);

    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
                { role: 'system', content: 'You are an expert document analyst. Analyze the provided text carefully and create accurate, informative summaries based only on the content given. Do not make assumptions or add information not present in the text.' },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 800,
            temperature: 0.7
        });

        const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            }
        };

        console.log(`[${requestId}] Sending request to OpenAI API...`);

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    console.log(`[${requestId}] OpenAI API response status: ${res.statusCode}`);
                    
                    if (res.statusCode === 200) {
                        const response = JSON.parse(data);
                        const summary = response?.choices?.[0]?.message?.content?.trim();
                        if (summary) {
                            console.log(`[${requestId}] OpenAI summary generated successfully, length: ${summary.length}`);
                            console.log(`[${requestId}] Summary preview: ${summary.substring(0, 100)}...`);
                            resolve(summary);
                        } else {
                            console.error(`[${requestId}] OpenAI response has no content`);
                            resolve(null);
                        }
                    } else {
                        console.error(`[${requestId}] OpenAI API error: ${res.statusCode}`, data);
                        resolve(null);
                    }
                } catch (e) {
                    console.error(`[${requestId}] Failed to parse OpenAI response:`, e);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.error(`[${requestId}] OpenAI request error:`, e);
            resolve(null);
        });

        req.write(payload);
        req.end();
    });
}
