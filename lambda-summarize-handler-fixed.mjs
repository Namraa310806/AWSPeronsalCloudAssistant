// ==========================================
// LAMBDA FUNCTION 3: SUMMARIZE HANDLER (.mjs) - ENHANCED WITH OPTIONS & MONITORING
// ==========================================

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";
import { inflateSync } from "zlib";

// Initialize clients
const s3Client = new S3Client({ region: 'ap-south-1' });
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' }); // Bedrock available in us-east-1
const cloudwatchClient = new CloudWatchClient({ region: 'ap-south-1' });
const textractClient = new TextractClient({ region: 'ap-south-1' });
const BUCKET_NAME = 'pca-files-namraa';
const NAMESPACE = 'PersonalCloudAssistant/Summarize';
const PDF_MAGIC = '%PDF';
const MAX_CONTENT_CHARS = 6000; // keep below Bedrock token limit headroom

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

        try {
            const prompts = {
                'brief': `You are summarizing a document for a busy user. Only use information explicitly present in the text; do NOT infer or invent topics. State what the document is (type/purpose) and its main topics. Ignore garbled text, random glyphs, or non-English bits. If content is unreadable or insufficient to know the topic, say "Text not readable".\n\nContent:\n${textToSummarize}\n\nReturn: 2-3 sentences covering document type, subject, and key points based solely on the provided content.` ,
                'detailed': `You are summarizing a document for a busy user. Only use information explicitly present in the text; do NOT infer or invent topics. State what the document is (type/purpose), who it is for, and the main sections/steps. Ignore garbled text, random glyphs, or non-English bits. If content is unreadable or insufficient to know the topic, say "Text not readable".\n\nContent:\n${textToSummarize}\n\nReturn: 1 short paragraph plus 3-7 bullets of key points/sections derived only from the content.` ,
                'bullet': `Summarize this document as concise English bullets describing what it is (type/purpose) and the main points/sections. Only use information explicitly present; do NOT invent topics. Ignore garbled text, random glyphs, or non-English bits. If content is unreadable or insufficient to know the topic, say "Text not readable".\n\nContent:\n${textToSummarize}\n\nReturn: 5-8 bullets based solely on the content.` ,
                'sentiment': `Summarize this document in English, focusing on its purpose and key points, then state the sentiment/tone if discernible from the text. Only use information explicitly present; do NOT invent topics. Ignore garbled text, random glyphs, or non-English bits. If content is unreadable or insufficient, say "Text not readable".\n\nContent:\n${textToSummarize}\n\nReturn: 2-3 sentences plus a tone label derived only from the content.` ,
                'technical': `Provide a technical English summary describing what the document is (type/purpose), the systems or components involved, and the main procedures/steps. Only use information explicitly present; do NOT invent topics. Ignore garbled text, random glyphs, or non-English bits. If content is unreadable or insufficient, say "Text not readable".\n\nContent:\n${textToSummarize}\n\nReturn: 1 short paragraph plus 3-7 technical bullets derived only from the content.`
            };

            const selectedPrompt = prompts[summaryType] || prompts['brief'];
            console.log(`[${requestId}] Calling Bedrock with summary type: ${summaryType}`);

            const controller = new AbortController();
            const BEDROCK_TIMEOUT_MS = 1800;
            const timer = setTimeout(() => controller.abort(), BEDROCK_TIMEOUT_MS);

            // Titan Text expects inputText + textGenerationConfig, not Anthropic messages
            const modelInput = {
                inputText: selectedPrompt,
                textGenerationConfig: {
                    maxTokenCount: 500,
                    temperature: 0.3,
                    topP: 0.9
                }
            };

            const command = new InvokeModelCommand({
                modelId: "amazon.titan-text-express-v1",
                body: JSON.stringify(modelInput),
                contentType: "application/json",
                accept: "application/json",
                abortSignal: controller.signal
            });

            const response = await bedrockClient.send(command);
            clearTimeout(timer);
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));
            const summary = responseBody?.results?.[0]?.outputText || 'Unable to generate summary';

            // If model returns an explicit unreadable message, pass it through unchanged

            const duration = Date.now() - startTime;
            await sendMetric('RequestDuration', duration, 'Milliseconds');
            await sendMetric('SummariesGenerated', 1, 'Count');
            await sendMetric('ContentLength', textToSummarize.length, 'Bytes');

            console.log(`[${requestId}] [SUCCESS] Summary generated in ${duration}ms`);

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    summary,
                    originalLength: textToSummarize.length,
                    type,
                    summaryType,
                    model: 'amazon.titan-text-express-v1',
                    source: 'bedrock'
                })
            };

        } catch (error) {
            console.error(`[${requestId}] Bedrock error:`, error);
            const bedrockUnavailable = error.name === 'ResourceNotFoundException' || error.name === 'AbortError';

            const sentences = textToSummarize.split(/[.!?]+/).filter(s => s.trim().length > 10);
            const fallbackSummary = sentences.slice(0, Math.max(1, Math.ceil(sentences.length / 3))).join('. ').trim() + '.';

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
                    source: 'fallback',
                    warning: bedrockUnavailable
                        ? 'Bedrock model unavailable or not permitted; using fallback summarizer'
                        : 'AI summarization unavailable, using fallback summarizer'
                })
            };
        }

    } catch (error) {
        const duration = Date.now() - startTime;
        await sendMetric('Errors', 1, 'Count');
        await sendMetric('RequestDuration', duration, 'Milliseconds');

        console.error(`[${requestId}] [ERROR] Unexpected error after ${duration}ms:`, error);
        const fallbackSummary = lastText
            ? (lastText.split(/[.!?]+/).filter(s => s.trim().length > 10).slice(0, 3).join('. ').trim() + '.')
            : 'Summary unavailable due to an unexpected error.';
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                summary: fallbackSummary,
                source: 'fallback',
                warning: `Unexpected error (requestId=${requestId}). AI summarization unavailable.`
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
