import OpenAI from "openai";
import { prisma } from "../lib/prisma.js";
import PDFParser from "pdf-parse";
import mammoth from "mammoth";
import fetch from "node-fetch";
import embeddingCache from "./embeddingCacheService.js";

// Initialize OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuration
const CHUNK_SIZE = 800; // tokens per chunk
const CHUNK_OVERLAP = 100; // overlap between chunks
const MAX_CHUNKS_PER_QUERY = 5; // max chunks to retrieve for context

// Similarity threshold for RAG
const SIMILARITY_THRESHOLD = 0.05;

// URL validation configuration
const URL_VALIDATION_TIMEOUT = 5000; // 5 seconds timeout
const MAX_CONCURRENT_VALIDATIONS = 3; // Limit concurrent validations

/**
 * Estimate token count for text (rough approximation: 1 token ≈ 4 characters)
 */
const estimateTokenCount = (text) => {
  return Math.ceil(text.length / 4);
};

/**
 * Validate if a URL is accessible
 */
const validateURL = async (url, timeout = URL_VALIDATION_TIMEOUT) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: "HEAD", // Only check headers, don't download content
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Educational-Bot/1.0)",
      },
    });

    clearTimeout(timeoutId);

    // Consider successful if status is 2xx or 3xx
    return response.status >= 200 && response.status < 400;
  } catch (error) {
    // URL is not accessible
    return false;
  }
};

/**
 * Generate fallback URLs for common educational domains
 */
const generateFallbackURLs = (topic, type = "website") => {
  const fallbackDomains = {
    website: [
      `https://www.wikipedia.org/wiki/${encodeURIComponent(topic)}`,
      `https://scholar.google.com/scholar?q=${encodeURIComponent(topic)}`,
      `https://www.coursera.org/search?query=${encodeURIComponent(topic)}`,
    ],
  };

  return fallbackDomains[type] || fallbackDomains.website;
};

/**
 * Split text into chunks with overlap
 */
const chunkText = (text, maxTokens = CHUNK_SIZE, overlap = CHUNK_OVERLAP) => {
  const maxChars = maxTokens * 4; // Convert tokens to characters
  const overlapChars = overlap * 4;

  if (text.length <= maxChars) {
    return [{ content: text, tokenCount: estimateTokenCount(text) }];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChars;

    // If not at the end, try to break at sentence boundary
    if (end < text.length) {
      const lastSentence = text.lastIndexOf(".", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastSentence, lastNewline);

      if (breakPoint > start + maxChars * 0.5) {
        end = breakPoint + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push({
        content: chunk,
        tokenCount: estimateTokenCount(chunk),
      });
    }

    start = end - overlapChars;
  }

  return chunks;
};

/**
 * Parse PDF document
 */
const parsePDF = async (buffer) => {
  try {
    const data = await PDFParser(buffer);
    return {
      text: data.text,
      pageCount: data.numpages,
      metadata: data.info,
    };
  } catch (error) {
    throw new Error(`PDF parsing failed: ${error.message}`);
  }
};

/**
 * Parse DOCX document
 */
const parseDOCX = async (buffer) => {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      pageCount: null, // DOCX doesn't have explicit pages
      metadata: {},
    };
  } catch (error) {
    throw new Error(`DOCX parsing failed: ${error.message}`);
  }
};

/**
 * Parse PPTX document (basic implementation)
 */
const parsePPTX = async (buffer) => {
  try {
    // Basic PPTX text extraction
    // PPTX is essentially a ZIP file with XML content
    const text = buffer.toString("utf-8");

    // Try to extract text between XML tags commonly used in PPTX
    const patterns = [
      /<a:t[^>]*>(.*?)<\/a:t>/g,
      /<t>(.*?)<\/t>/g,
      /<p:txBody[^>]*>(.*?)<\/p:txBody>/g,
    ];

    let extractedText = "";
    patterns.forEach((pattern) => {
      const matches = text.match(pattern) || [];
      extractedText +=
        matches
          .map((match) => match.replace(/<[^>]+>/g, " ").trim())
          .join(" ") + " ";
    });

    // Clean up the text
    extractedText = extractedText
      .replace(/\s+/g, " ")
      .replace(/[^\w\s\.\,\!\?\-]/g, " ")
      .trim();

    return {
      text: extractedText || "Could not extract readable text from PPTX file",
      pageCount: null,
      metadata: { note: "Basic PPTX parsing - may not capture all content" },
    };
  } catch (error) {
    return {
      text: "PPTX file detected but could not extract text content",
      pageCount: null,
      metadata: { error: error.message },
    };
  }
};

/**
 * Parse HTML document
 */
const parseHTML = (text) => {
  const cleanText = text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    text: cleanText,
    pageCount: null,
    metadata: {},
  };
};

/**
 * Fetch and parse document from URL
 */
const fetchAndParseDocument = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const buffer = Buffer.from(await response.arrayBuffer());

    let parsed;
    let documentType;

    if (contentType.includes("application/pdf")) {
      parsed = await parsePDF(buffer);
      documentType = "pdf";
    } else if (
      contentType.includes(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ) {
      parsed = await parseDOCX(buffer);
      documentType = "docx";
    } else if (
      contentType.includes(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      )
    ) {
      parsed = await parsePPTX(buffer);
      documentType = "pptx";
    } else if (contentType.includes("text/html")) {
      const text = buffer.toString("utf-8");
      parsed = parseHTML(text);
      documentType = "html";
    } else {
      // Fallback for plain text
      parsed = {
        text: buffer.toString("utf-8"),
        pageCount: null,
        metadata: {},
      };
      documentType = "text";
    }

    return {
      ...parsed,
      documentType,
      fileSize: buffer.length,
    };
  } catch (error) {
    console.error(`Error fetching/parsing document from ${url}:`, error);
    throw error;
  }
};

/**
 * Generate embeddings for text using OpenAI with caching
 */
const generateEmbeddings = async (text) => {
  try {
    // Check cache first
    const cachedEmbedding = embeddingCache.get(text);
    if (cachedEmbedding) {
      return cachedEmbedding;
    }

    // Try to find similar cached embedding
    const similarEmbedding = embeddingCache.findSimilarCached(text, 0.85);
    if (similarEmbedding) {
      return similarEmbedding;
    }

    console.log(
      `🔄 Generating new embedding for text (${text.length} chars)...`
    );
    const startTime = Date.now();

    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    const embedding = response.data[0].embedding;
    const duration = Date.now() - startTime;

    console.log(`✅ Generated embedding in ${duration}ms`);

    // Cache the result
    embeddingCache.set(text, embedding);

    return embedding;
  } catch (error) {
    console.error("Error generating embeddings:", error);
    throw error;
  }
};

/**
 * Process document: parse, chunk, and generate embeddings
 */
export const processDocument = async (contentId) => {
  try {
    // Get document info
    const content = await prisma.content.findUnique({
      where: { contentId },
      include: { course: true },
    });

    if (!content || !content.documentUrl) {
      throw new Error("Content not found or no document URL");
    }

    console.log(`Processing document: ${content.title}`);

    // Parse document
    const parsed = await fetchAndParseDocument(content.documentUrl);

    if (!parsed.text || parsed.text.trim().length === 0) {
      throw new Error("No text content extracted from document");
    }

    // Update content with document metadata
    await prisma.content.update({
      where: { contentId },
      data: {
        documentType: parsed.documentType,
        fileSize: parsed.fileSize,
        pageCount: parsed.pageCount,
        processingError: null,
      },
    });

    // Chunk the text
    const chunks = chunkText(parsed.text);
    console.log(
      `Created ${chunks.length} chunks for document: ${content.title}`
    );

    // Process chunks and generate embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      try {
        // Generate embeddings for the chunk
        const embeddings = await generateEmbeddings(chunk.content);

        // Save chunk to database using raw SQL to insert vector properly
        await prisma.$executeRaw`
          INSERT INTO document_chunks ("contentId", "chunkIndex", content, "tokenCount", embeddings, "createdAt", "updatedAt")
          VALUES (${contentId}, ${i}, ${chunk.content}, ${chunk.tokenCount}, ${embeddings}::vector, NOW(), NOW())
        `;

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (chunkError) {
        console.error(
          `Error processing chunk ${i} for content ${contentId}:`,
          chunkError
        );
        // Continue with other chunks
      }
    }

    // Mark document as processed
    await prisma.content.update({
      where: { contentId },
      data: { isProcessed: true },
    });

    console.log(`Successfully processed document: ${content.title}`);
    return { success: true, chunksCreated: chunks.length };
  } catch (error) {
    console.error(`Error processing document ${contentId}:`, error);

    // Mark document as failed with error
    await prisma.content.update({
      where: { contentId },
      data: {
        processingError: error.message,
        isProcessed: false,
      },
    });

    throw error;
  }
};

/**
 * Find similar chunks using optimized vector similarity search with caching
 */
export const findSimilarChunks = async (
  queryText,
  courseId,
  limit = MAX_CHUNKS_PER_QUERY
) => {
  try {
    const startTime = Date.now();
    console.log(
      `🔍 Finding similar chunks for query (${queryText.length} chars)...`
    );

    // Generate embeddings for the query (with caching)
    const queryEmbeddings = await generateEmbeddings(queryText);
    const embeddingVector = `[${queryEmbeddings.join(",")}]`;

    // Optimized query: Apply threshold in database and use better ordering
    const allChunks = await prisma.$queryRaw`
      SELECT 
        dc."chunkId",
        dc."contentId",
        dc."chunkIndex",
        dc.content,
        dc."tokenCount",
        dc."pageNumber",
        c.title as document_title,
        c."documentUrl" as document_url,
        co."courseName" as course_name,
        co."courseCode" as course_code,
        (1 - (dc.embeddings <=> ${embeddingVector}::vector)) as similarity
      FROM document_chunks dc
      JOIN contents c ON dc."contentId" = c."contentId"
      JOIN courses co ON c."courseId" = co."courseId"
      WHERE c."courseId" = ${courseId}::uuid
        AND c."isProcessed" = true
        AND dc.embeddings IS NOT NULL
        AND (1 - (dc.embeddings <=> ${embeddingVector}::vector)) > ${SIMILARITY_THRESHOLD}
      ORDER BY dc.embeddings <=> ${embeddingVector}::vector
      LIMIT ${limit}
    `;

    const duration = Date.now() - startTime;

    if (allChunks.length === 0) {
      console.log(
        `⚠️  No chunks found above ${(SIMILARITY_THRESHOLD * 100).toFixed(
          0
        )}% similarity threshold (${duration}ms)`
      );
      return [];
    }

    console.log(
      `✅ Found ${
        allChunks.length
      } relevant chunks in ${duration}ms (avg similarity: ${(
        (allChunks.reduce(
          (sum, chunk) => sum + parseFloat(chunk.similarity),
          0
        ) /
          allChunks.length) *
        100
      ).toFixed(1)}%)`
    );

    return allChunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.pageNumber,
      similarity: parseFloat(chunk.similarity),
      document: {
        title: chunk.document_title,
        url: chunk.document_url,
      },
      course: {
        name: chunk.course_name,
        code: chunk.course_code,
      },
    }));
  } catch (error) {
    console.error("Error finding similar chunks:", error);
    return [];
  }
};

/**
 * Get conversation history from current session
 */
const getConversationHistory = async (sessionId, maxTokens = 2000) => {
  try {
    const messages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { timestamp: "asc" },
      select: {
        content: true,
        isFromUser: true,
        timestamp: true,
      },
    });

    // Convert to OpenAI format and estimate tokens
    const conversation = [];
    let tokenCount = 0;

    // Process messages in reverse order to prioritize recent messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const role = message.isFromUser ? "user" : "assistant";
      const messageTokens = estimateTokenCount(message.content);

      // Stop if adding this message would exceed token limit
      if (tokenCount + messageTokens > maxTokens) {
        break;
      }

      conversation.unshift({
        role,
        content: message.content,
      });
      tokenCount += messageTokens;
    }

    return conversation;
  } catch (error) {
    console.error("Error retrieving conversation history:", error);
    return [];
  }
};

/**
 * Process uploaded document for student context (temporary analysis, not stored)
 */
const processStudentDocument = async (documentBuffer, mimeType, courseName) => {
  try {
    console.log(`📄 Processing student document (${mimeType})...`);

    // Parse document content using existing parsing functions
    let parsed;

    if (mimeType === "application/pdf") {
      parsed = await parsePDF(documentBuffer);
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      parsed = await parseDOCX(documentBuffer);
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ) {
      parsed = await parsePPTX(documentBuffer);
    } else if (mimeType === "text/html") {
      const text = documentBuffer.toString("utf-8");
      parsed = parseHTML(text);
    } else if (mimeType === "text/plain") {
      parsed = {
        text: documentBuffer.toString("utf-8"),
        pageCount: 1,
        metadata: {},
      };
    } else {
      throw new Error(`Unsupported document type: ${mimeType}`);
    }

    // For short documents, use the original approach
    if (parsed.text.length <= 8000) {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `Anda adalah tutor AI ahli untuk mata kuliah "${courseName}".
Seorang mahasiswa telah mengunggah dokumen berikut untuk dianalisis dan didiskusikan.

DOKUMEN MAHASISWA:
${parsed.text}

Tugas Anda:
1. **Identifikasi Konsep Utama**: Identifikasi 3-5 konsep atau topik utama dalam dokumen ini
2. **Relevansi dengan Mata Kuliah**: Jelaskan bagaimana dokumen ini relevan dengan mata kuliah "${courseName}"
3. **Poin-Poin Diskusi**: Buatkan 2-3 pertanyaan diskusi yang dapat membantu mahasiswa memahami dokumen lebih dalam
4. **Ringkasan Edukatif**: Berikan ringkasan singkat yang fokus pada aspek pembelajaran

Format respons Anda dalam struktur yang jelas dengan heading untuk setiap bagian.
Gunakan Bahasa Indonesia yang baik dan benar.
Fokus pada aspek edukatif, bukan hanya deskriptif.`,
          },
        ],
        max_completion_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
        temperature: 0.3,
      });

      return {
        originalText: parsed.text,
        analysis: response.choices[0].message.content,
        metadata: {
          pageCount: parsed.pageCount,
          wordCount: parsed.text.split(/\s+/).length,
          documentType: mimeType,
          processedAt: new Date().toISOString(),
          chunkCount: 1,
        },
        usage: response.usage,
      };
    }

    // For long documents, use chunked analysis
    console.log(
      `📄 Document is long (${parsed.text.length} chars), using chunked analysis...`
    );

    // Chunk the document with larger chunks for student context
    const chunks = chunkText(parsed.text, 3200, 400); // ~800 words per chunk with overlap
    const maxChunksToAnalyze = Math.min(3, chunks.length); // Analyze up to 3 chunks

    console.log(
      `📄 Analyzing ${maxChunksToAnalyze} chunks out of ${chunks.length} total chunks`
    );

    // Analyze each chunk individually
    const chunkAnalyses = [];
    let totalUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    for (let i = 0; i < maxChunksToAnalyze; i++) {
      const chunk = chunks[i];

      try {
        const chunkResponse = await client.chat.completions.create({
          model: "gpt-4.1-mini-2025-04-14",
          messages: [
            {
              role: "user",
              content: `Anda adalah tutor AI ahli untuk mata kuliah "${courseName}".
Seorang mahasiswa telah mengunggah dokumen panjang. Ini adalah bagian ${
                i + 1
              } dari ${maxChunksToAnalyze} yang sedang dianalisis.

BAGIAN DOKUMEN ${i + 1}:
${chunk.content}

Tugas Anda untuk bagian ini:
1. **Konsep Utama**: Identifikasi 2-3 konsep utama dalam bagian ini
2. **Poin Penting**: Sebutkan 2-3 poin penting yang perlu dipahami mahasiswa
3. **Relevansi Pembelajaran**: Jelaskan bagaimana bagian ini relevan dengan mata kuliah "${courseName}"
4. **Ringkasan Singkat**: Berikan ringkasan 2-3 kalimat untuk bagian ini

Jawab dalam format yang jelas dan ringkas. Fokus pada aspek edukatif.`,
            },
          ],
          max_tokens: 600, // Smaller per-chunk analysis
          temperature: 0.3,
        });

        chunkAnalyses.push({
          chunkIndex: i + 1,
          analysis: chunkResponse.choices[0].message.content,
          tokenCount: chunk.tokenCount,
        });

        // Accumulate usage stats
        if (chunkResponse.usage) {
          totalUsage.prompt_tokens += chunkResponse.usage.prompt_tokens || 0;
          totalUsage.completion_tokens +=
            chunkResponse.usage.completion_tokens || 0;
          totalUsage.total_tokens += chunkResponse.usage.total_tokens || 0;
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (chunkError) {
        console.error(`Error analyzing chunk ${i + 1}:`, chunkError);
        chunkAnalyses.push({
          chunkIndex: i + 1,
          analysis: `[Error: Tidak dapat menganalisis bagian ${
            i + 1
          } dari dokumen]`,
          tokenCount: chunk.tokenCount,
        });
      }
    }

    // Generate comprehensive summary from all chunk analyses
    const combinedAnalyses = chunkAnalyses
      .map((ca) => `**BAGIAN ${ca.chunkIndex}:**\n${ca.analysis}`)
      .join("\n\n");

    const summaryResponse = await client.chat.completions.create({
      model: "gpt-4.1-mini-2025-04-14",
      messages: [
        {
          role: "user",
          content: `Anda adalah tutor AI ahli untuk mata kuliah "${courseName}".
Seorang mahasiswa telah mengunggah dokumen panjang yang telah dianalisis per bagian. 
Berdasarkan analisis bagian-bagian berikut, buatlah ringkasan komprehensif:

${combinedAnalyses}

Tugas Anda:
1. **Konsep Utama Dokumen**: Gabungkan dan identifikasi 4-6 konsep utama dari seluruh dokumen
2. **Relevansi dengan Mata Kuliah**: Jelaskan bagaimana keseluruhan dokumen relevan dengan mata kuliah "${courseName}"
3. **Poin-Poin Diskusi**: Buatkan 3-4 pertanyaan diskusi yang menghubungkan berbagai bagian dokumen
4. **Ringkasan Edukatif**: Berikan ringkasan komprehensif yang menunjukkan alur pemikiran dalam dokumen
5. **Catatan Analisis**: Sebutkan bahwa ini adalah analisis dari ${maxChunksToAnalyze} bagian utama dokumen${
            chunks.length > maxChunksToAnalyze
              ? ` (dari total ${chunks.length} bagian)`
              : ""
          }

Format respons dengan struktur yang jelas. Gunakan Bahasa Indonesia yang baik dan benar.
Fokus pada keterkaitan antar bagian dan pemahaman holistik.`,
        },
      ],
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
      temperature: 0.3,
    });

    // Add summary usage to total
    if (summaryResponse.usage) {
      totalUsage.prompt_tokens += summaryResponse.usage.prompt_tokens || 0;
      totalUsage.completion_tokens +=
        summaryResponse.usage.completion_tokens || 0;
      totalUsage.total_tokens += summaryResponse.usage.total_tokens || 0;
    }

    return {
      originalText: parsed.text,
      analysis: summaryResponse.choices[0].message.content,
      metadata: {
        pageCount: parsed.pageCount,
        wordCount: parsed.text.split(/\s+/).length,
        documentType: mimeType,
        processedAt: new Date().toISOString(),
        chunkCount: chunks.length,
        analyzedChunks: maxChunksToAnalyze,
        tokensAnalyzed: chunkAnalyses.reduce(
          (sum, ca) => sum + ca.tokenCount,
          0
        ),
      },
      chunkAnalyses: chunkAnalyses, // Individual chunk analyses for reference
      usage: totalUsage,
    };
  } catch (error) {
    console.error("Error processing student document:", error);
    throw new Error("Failed to process uploaded document");
  }
};

/**
 * Process uploaded image using GPT-4 Vision
 */
const processImageForContext = async (imageBuffer, mimeType, courseName) => {
  try {
    const base64Image = imageBuffer.toString("base64");

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Anda adalah tutor AI ahli untuk mata kuliah "${courseName}".
Seorang mahasiswa telah mengirimkan gambar ini untuk meminta penjelasan.

Peran Anda adalah membantu mereka memahami gambar ini, bukan hanya mendeskripsikannya. Ikuti langkah-langkah berikut:
1.  **Identifikasi Konsep Utama**: Pertama, identifikasi konsep atau proses utama yang diilustrasikan dalam gambar ini.
2.  **Jelaskan Langkah-demi-Langkah**: Uraikan gambar tersebut menjadi bagian-bagian atau langkah-langkah yang lebih kecil. Jelaskan setiap bagian secara sistematis.
3.  **Ajukan Pertanyaan Pancingan**: Setelah menjelaskan, ajukan pertanyaan yang mendorong mahasiswa untuk berpikir kritis tentag gambar tersebut. Contoh: "Menurutmu, apa yang akan terjadi jika langkah X dihilangkan?" atau "Bagaimana bagian A terhubung dengan bagian B?".

Gaya Komunikasi:
- Gunakan bahasa yang edukatif dan mendorong.
- Hindari memberikan semua informasi sekaligus. Buat mahasiswa merasa seperti mereka ikut menemukan jawabannya.
- Jawab dalam Bahasa Indonesia yang baik dan benar.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
    });

    return {
      description: response.choices[0].message.content,
      usage: response.usage,
    };
  } catch (error) {
    console.error("Error processing image with GPT-4V:", error);
    throw new Error("Failed to process uploaded image");
  }
};

/**
 * Enhanced RAG with external references
 */
export const getChatResponseWithContextAndReferences = async (
  userMessage,
  courseId,
  courseName,
  courseCode,
  sessionId = null,
  fileContext = null, // Can contain both image and document contexts
  includeExternalReferences = true
) => {
  try {
    // Process uploaded file (image or document) if provided
    let processedImageContext = null;
    let processedDocumentContext = null;

    if (fileContext && fileContext.buffer && fileContext.mimeType) {
      const isImage = fileContext.mimeType.startsWith("image/");
      const isDocument = !isImage;

      if (isImage) {
        console.log(
          `🖼️ Processing uploaded image (${fileContext.mimeType})...`
        );
        processedImageContext = await processImageForContext(
          fileContext.buffer,
          fileContext.mimeType,
          courseName
        );
        console.log(`✅ Image processed successfully`);
      } else if (isDocument) {
        console.log(
          `📄 Processing uploaded document (${fileContext.mimeType})...`
        );
        processedDocumentContext = await processStudentDocument(
          fileContext.buffer,
          fileContext.mimeType,
          courseName
        );
        console.log(`✅ Document processed successfully`);
      }
    }

    // Run all parallel operations for better performance
    console.log("🚀 Starting parallel data retrieval...");
    const parallelStart = Date.now();

    const parallelPromises = [
      findSimilarChunks(userMessage, courseId),
      sessionId ? getConversationHistory(sessionId) : Promise.resolve([]),
    ];

    // Add external references if enabled
    if (
      includeExternalReferences &&
      process.env.ENABLE_EXTERNAL_REFERENCES !== "false"
    ) {
      parallelPromises.push(
        generateExternalReferences(userMessage, courseName, courseCode)
      );
    }

    const results = await Promise.allSettled(parallelPromises);
    const parallelDuration = Date.now() - parallelStart;

    // Extract results
    const relevantChunks =
      results[0].status === "fulfilled" ? results[0].value : [];
    const conversationHistory =
      results[1].status === "fulfilled" ? results[1].value : [];

    let externalReferences = { journals: [], books: [], websites: [] };

    if (
      includeExternalReferences &&
      process.env.ENABLE_EXTERNAL_REFERENCES !== "false"
    ) {
      if (results[2] && results[2].status === "fulfilled") {
        externalReferences = results[2].value;
        console.log(
          `✅ Generated ${externalReferences.journals.length} journal refs, ${externalReferences.books.length} book refs, ${externalReferences.websites.length} website refs`
        );
      } else if (results[2]) {
        console.error(
          "❌ Failed to generate external references:",
          results[2].reason
        );
      }
    }

    console.log(
      `🏎️ Parallel data retrieval completed in ${parallelDuration}ms`
    );

    let systemPrompt;
    let referencedDocuments = [];

    if (relevantChunks.length > 0) {
      // Group chunks by document to avoid presenting same document as multiple documents
      const documentGroups = {};

      relevantChunks.forEach((chunk, index) => {
        referencedDocuments.push({
          title: chunk.document.title,
          url: chunk.document.url,
          chunkId: chunk.chunkId,
          similarity: chunk.similarity,
        });

        const docKey = chunk.document.title;
        if (!documentGroups[docKey]) {
          documentGroups[docKey] = {
            title: chunk.document.title,
            url: chunk.document.url,
            chunks: [],
          };
        }
        documentGroups[docKey].chunks.push({
          content: chunk.content,
          similarity: chunk.similarity,
          chunkIndex: index + 1,
        });
      });

      // Build context sections grouped by document with token limit management
      const MAX_CONTEXT_TOKENS = 4000; // Reasonable limit for context
      let contextTokenCount = 0;
      const contextSections = [];

      for (const doc of Object.values(documentGroups)) {
        const docHeader = `## Dokumen: ${doc.title}`;
        let docContent = docHeader + "\n\n";

        for (const chunk of doc.chunks) {
          const chunkText = `**Bagian ${chunk.chunkIndex}** (Relevansi: ${(
            chunk.similarity * 100
          ).toFixed(1)}%)\n${chunk.content}\n\n`;
          const chunkTokens = estimateTokenCount(chunkText);

          // Check if adding this chunk would exceed token limit
          if (contextTokenCount + chunkTokens > MAX_CONTEXT_TOKENS) {
            docContent += `[Bagian lain dari dokumen tidak ditampilkan untuk menghemat ruang]\n\n`;
            break;
          }

          docContent += chunkText;
          contextTokenCount += chunkTokens;
        }

        contextSections.push(docContent.trim());

        // Stop if we're approaching token limit
        if (contextTokenCount >= MAX_CONTEXT_TOKENS) {
          break;
        }
      }

      const finalContextSections = contextSections.join("\n\n---\n\n");

      // Build file context sections if provided (with token limits)
      let imageContextSection = "";
      let documentContextSection = "";

      if (processedImageContext) {
        const imageDesc = processedImageContext.description.substring(0, 1500); // Limit image description
        imageContextSection = `\n\n## GAMBAR YANG DIUNGGAH MAHASISWA:\n${imageDesc}${
          processedImageContext.description.length > 1500 ? "..." : ""
        }\n`;
      }

      if (processedDocumentContext) {
        const docAnalysis = processedDocumentContext.analysis.substring(
          0,
          1500
        ); // Limit document analysis
        documentContextSection = `\n\n## DOKUMEN YANG DIUNGGAH MAHASISWA:\n${docAnalysis}${
          processedDocumentContext.analysis.length > 1500 ? "..." : ""
        }\n`;
      }

      const allFileContexts = imageContextSection + documentContextSection;

      // Build external references sections
      let externalReferencesSection = "";
      if (
        externalReferences.journals.length > 0 ||
        externalReferences.books.length > 0 ||
        externalReferences.websites.length > 0
      ) {
        externalReferencesSection = `\n\n## REFERENSI EKSTERNAL YANG RELEVAN:\n`;

        if (externalReferences.journals.length > 0) {
          externalReferencesSection += `\n**Jurnal Ilmiah:**\n`;
          externalReferences.journals.forEach((journal, index) => {
            externalReferencesSection += `${index + 1}. ${journal.title} (${
              journal.authors
            }, ${journal.year})\n   Penerbit: ${
              journal.publisher
            }\n   Relevansi: ${journal.relevance}\n   Keywords: ${
              journal.keywords?.join(", ") || "N/A"
            }\n`;
            if (journal.doi) {
              externalReferencesSection += `   DOI: ${journal.doi}\n`;
            }
            externalReferencesSection += "\n";
          });
        }

        if (externalReferences.books.length > 0) {
          externalReferencesSection += `\n**Buku Referensi:**\n`;
          externalReferences.books.forEach((book, index) => {
            externalReferencesSection += `${index + 1}. ${book.title} (${
              book.authors
            }, ${book.year})\n   Penerbit: ${book.publisher}\n   Relevansi: ${
              book.relevance
            }\n`;
            if (book.isbn) {
              externalReferencesSection += `   ISBN: ${book.isbn}\n`;
            }
            externalReferencesSection += "\n";
          });
        }

        if (externalReferences.websites.length > 0) {
          externalReferencesSection += `\n**Sumber Online:**\n`;
          externalReferences.websites.forEach((site, index) => {
            externalReferencesSection += `${index + 1}. ${site.title} (${
              site.type
            })\n   Sumber: ${site.source}\n   URL: ${site.url}\n   Relevansi: ${
              site.relevance
            }\n\n`;
          });
        }
      }

      systemPrompt = `Anda adalah seorang tutor AI ahli untuk mata kuliah "${courseName}" (${courseCode}).
Peran utama Anda adalah membantu mahasiswa memahami materi, bukan memberikan jawaban instan untuk tugas.

Anda memiliki akses ke dokumen dan materi pembelajaran berikut yang relevan dengan pertanyaan mahasiswa:

${finalContextSections}${allFileContexts}${externalReferencesSection}

Gunakan SEMUA informasi di atas (dokumen course dan referensi eksternal${
        processedImageContext || processedDocumentContext
          ? ", serta file yang diunggah mahasiswa"
          : ""
      }) untuk menjalankan tugas-tugas berikut:

1. **Jawaban Komprehensif**: Berikan jawaban yang menggabungkan materi course dengan referensi eksternal yang relevan
2. **Referensi yang Beragam**: Sebutkan dan referensikan sumber yang Anda gunakan dari:
   - Dokumen course yang tersedia
   - Jurnal ilmiah yang relevan
   - Buku referensi yang sesuai
   - Sumber online terpercaya
3. **Pembelajaran Lanjutan**: Sarankan mahasiswa untuk:
   - Membaca referensi eksternal untuk pengetahuan lebih mendalam
   - Mencari sumber tambahan dengan kata kunci yang diberikan
   - Mengeksplorasi topik terkait dari sumber akademik
4. **Bimbingan, Bukan Jawaban**: Jika pertanyaan menanyakan jawaban langsung untuk soal ujian atau tugas, JANGAN berikan jawabannya. Bimbing dengan:
   - Konsep terkait dari materi course
   - Referensi yang dapat membantu pemahaman
   - Pertanyaan pancingan untuk mendorong berpikir
5. **Transparansi**: Selalu jujur jika informasi tidak tersedia dan berikan alternatif sumber pembelajaran

**Format Jawaban yang Disarankan:**
- Mulai dengan jawaban utama berdasarkan materi course
- Tambahkan informasi dari referensi eksternal jika relevan
- Berikan saran untuk pembelajaran lanjutan
- Tutup dengan referensi yang digunakan

Gaya Komunikasi:
- Selalu bersikap positif, sabar, dan mendorong
- Gunakan Bahasa Indonesia yang baik, benar, dan mudah dipahami
- Strukturkan jawaban dengan poin-poin yang jelas
- Berikan referensi lengkap untuk semua sumber yang disebutkan`;
    } else {
      // Handle case with no RAG documents but possibly with uploaded files
      if (processedImageContext || processedDocumentContext) {
        const uploadedFileSection = processedImageContext
          ? `## GAMBAR YANG DIUNGGAH MAHASISWA:\n${processedImageContext.description}\n`
          : "";

        const uploadedDocSection = processedDocumentContext
          ? `## DOKUMEN YANG DIUNGGAH MAHASISWA:\n${processedDocumentContext.analysis}\n`
          : "";

        systemPrompt = `Anda adalah seorang tutor AI ahli untuk mata kuliah "${courseName}".
Peran utama Anda adalah membantu mahasiswa memahami materi, bukan memberikan jawaban instan untuk tugas.

Mahasiswa telah mengunggah file berikut:

${uploadedFileSection}${uploadedDocSection}

PENTING: Saat ini tidak ada dokumen materi pembelajaran yang relevan dari basis data, tetapi Anda dapat menggunakan file yang diunggah mahasiswa sebagai konteks.

Gunakan file yang diunggah dan pengetahuan umum tentang mata kuliah "${courseName}" untuk:
1. Menganalisis konten yang diunggah mahasiswa (visual, teks, konsep, dll).
2. Menjawab pertanyaan berdasarkan apa yang ada dalam file.
3. Memberikan penjelasan educational yang relevan dengan file dan mata kuliah.
4. Jika pertanyaan memerlukan informasi di luar file, sarankan mahasiswa untuk menghubungi dosen.
5. Jika pertanyaan menanyakan jawaban langsung untuk soal ujian atau tugas, JANGAN berikan jawabannya. Bimbing dengan konsep umum.

Gaya Komunikasi:
- Selalu bersikap positif, sabar, dan mendorong.
- Gunakan Bahasa Indonesia yang baik, benar, dan mudah dipahami.
- Referensikan file yang diunggah dalam jawaban Anda.
- Berikan saran konstruktif untuk pembelajaran lebih lanjut.`;
      } else {
        systemPrompt = `Anda adalah seorang tutor AI ahli untuk mata kuliah "${courseName}".
Peran utama Anda adalah membantu mahasiswa memahami materi, bukan memberikan jawaban instan untuk tugas.

PENTING: Saat ini tidak ada dokumen materi pembelajaran yang relevan atau tersedia untuk menjawab pertanyaan mahasiswa.

Dalam situasi ini, lakukan hal-hal berikut:
1. Beritahu mahasiswa dengan jujur bahwa tidak ada materi pembelajaran yang relevan tersedia saat ini untuk pertanyaan mereka.
2. Sarankan mahasiswa untuk menghubungi dosen atau asisten dosen untuk mendapatkan materi pembelajaran yang lebih spesifik.
3. Jika memungkinkan, berikan panduan umum tentang topik yang ditanyakan berdasarkan pengetahuan umum tentang mata kuliah "${courseName}".
4. Jika pertanyaan menanyakan jawaban langsung untuk soal ujian atau tugas, JANGAN berikan jawabannya. Tetap bimbing dengan konsep umum dan sarankan untuk mencari sumber yang tepat.
5. Dorong mahasiswa untuk aktif mencari sumber pembelajaran lain yang relevan.

Gaya Komunikasi:
- Selalu bersikap positif, sabar, dan mendorong.
- Jangan membuat mahasiswa merasa putus asa karena tidak ada materi.
- Gunakan Bahasa Indonesia yang baik, benar, dan mudah dipahami.
- Berikan saran konstruktif untuk mendapatkan bantuan lebih lanjut.`;
      }
    }

    // Build messages array with system prompt, conversation history, and current message
    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...conversationHistory,
      {
        role: "user",
        content: userMessage,
      },
    ];

    // Estimate total token count to prevent API errors
    const totalTokenEstimate = messages.reduce((total, msg) => {
      return total + estimateTokenCount(msg.content);
    }, 0);

    // Log request details for debugging (only in development)
    if (process.env.NODE_ENV === "development") {
      console.log("🔍 OpenAI Request Debug:");
      console.log("- Model:", process.env.OPENAI_MODEL || "gpt-4o-mini");
      console.log("- User message:", userMessage);
      console.log("- System prompt length:", systemPrompt.length, "characters");
      console.log(
        "- System prompt tokens (estimated):",
        estimateTokenCount(systemPrompt)
      );
      console.log("- Total estimated tokens:", totalTokenEstimate);
      console.log("- Total messages:", messages.length);
      console.log("- Referenced documents:", referencedDocuments.length);

      if (referencedDocuments.length > 0) {
        console.log(
          "- Document titles:",
          referencedDocuments.map((doc) => doc.title)
        );
      }

      // Warn if approaching token limits
      const maxTokens = 16000; // Conservative estimate for most models
      if (totalTokenEstimate > maxTokens * 0.8) {
        console.warn(
          `⚠️  Warning: Approaching token limit (${totalTokenEstimate}/${maxTokens})`
        );
      }
    }

    // Prevent requests that are too large
    const MAX_SAFE_TOKENS = 15000; // Conservative limit
    if (totalTokenEstimate > MAX_SAFE_TOKENS) {
      console.warn(
        `⚠️  Request too large (${totalTokenEstimate} tokens), truncating system prompt`
      );

      // Truncate system prompt if too large
      const targetSystemPromptTokens = Math.max(
        2000,
        MAX_SAFE_TOKENS - estimateTokenCount(userMessage) - 1000
      );
      const targetSystemPromptChars = targetSystemPromptTokens * 4;

      if (systemPrompt.length > targetSystemPromptChars) {
        systemPrompt =
          systemPrompt.substring(0, targetSystemPromptChars) +
          "\n\n[Konten dipotong untuk menghemat ruang. Masih memiliki akses ke dokumen yang relevan.]";
        messages[0].content = systemPrompt; // Update the system message
      }
    }

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      max_completion_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000,
      temperature: 0.7,
    });

    return {
      content: response.choices[0].message.content,
      usage: response.usage,
      model: response.model,
      referencedDocuments: referencedDocuments.slice(0, 3), // Limit to top 3 references
      externalReferences, // External academic references
    };
  } catch (error) {
    console.error("Error getting ChatGPT response with RAG context:", error);

    // Declare variables for error logging (fix scoping issue)
    let tokenEstimate = 0;
    const promptTokens =
      typeof systemPrompt !== "undefined"
        ? estimateTokenCount(systemPrompt)
        : 0;

    // Log more detailed error information
    if (error.response) {
      console.error("OpenAI API Response Error:", {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        requestSize:
          tokenEstimate > 0 ? `${tokenEstimate} tokens estimated` : "unknown",
      });
    } else if (error.request) {
      console.error("OpenAI API Request Error:", {
        message: error.message,
        code: error.code,
        type: error.type,
        requestSize:
          tokenEstimate > 0 ? `${tokenEstimate} tokens estimated` : "unknown",
      });
    } else {
      console.error("OpenAI API Error Details:", {
        message: error.message,
        name: error.name,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        requestSize:
          tokenEstimate > 0 ? `${tokenEstimate} tokens estimated` : "unknown",
      });
    }

    // If the error seems to be related to large requests, provide helpful info
    if (
      error.message?.includes("token") ||
      error.message?.includes("too large") ||
      error.message?.includes("context length")
    ) {
      console.error(
        `🔍 Token analysis: System prompt: ${promptTokens} tokens, Total request: ${tokenEstimate} tokens`
      );
      console.error(
        "💡 This error might be related to the RAG context being too large. Consider reducing MAX_CONTEXT_TOKENS."
      );
    }

    throw error;
  }
};

/**
 * Validate website references and replace broken URLs with working alternatives
 */
const validateWebsiteReferences = async (websites, query) => {
  if (!websites || websites.length === 0) return [];

  console.log(`🔍 Validating ${websites.length} website references...`);

  const validatedWebsites = await Promise.all(
    websites.map(async (website, index) => {
      if (!website.url) {
        console.log(`⚠️ Website ${index + 1}: No URL provided`);
        return website;
      }

      const isValid = await validateURL(website.url);

      if (isValid) {
        console.log(`✅ Website ${index + 1}: ${website.url} - Valid`);
        return { ...website, isValidated: true };
      } else {
        console.log(
          `❌ Website ${index + 1}: ${
            website.url
          } - Broken, generating fallback`
        );

        // Generate fallback URLs based on the topic
        const fallbackUrls = generateFallbackURLs(query, "website");

        return {
          ...website,
          url: fallbackUrls[0], // Use the first fallback URL
          originalUrl: website.url, // Keep original for reference
          isValidated: false,
          isFallback: true,
          title: website.title + " (Pencarian Umum)", // Indicate it's a search
          relevance: `Pencarian umum untuk topik "${query}". URL asli tidak dapat diakses.`,
        };
      }
    })
  );

  return validatedWebsites;
};

/**
 * Generate external academic references using OpenAI
 */
const generateExternalReferences = async (query, courseName, courseCode) => {
  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Anda adalah generator JSON. Anda HARUS merespons HANYA dengan JSON yang valid. Jangan sertakan penjelasan, teks, atau format apa pun di luar struktur JSON. Respons harus dimulai dengan '{' dan diakhiri dengan '}'.",
        },
        {
          role: "user",
          content: `Untuk pertanyaan "${query}" pada mata kuliah "${courseName}" (${courseCode}), buatkan referensi akademik eksternal. Berikan HANYA JSON yang valid dalam format ini:

{
  "journals": [
    {
      "title": "Judul jurnal ilmiah",
      "authors": "Nama penulis",
      "year": "2023",
      "publisher": "Nama jurnal/conference",
      "relevance": "Penjelasan relevansi dengan topik",
      "keywords": ["kata kunci 1", "kata kunci 2"],
      "doi": "10.1000/contoh"
    }
  ],
  "books": [
    {
      "title": "Judul buku",
      "authors": "Nama penulis",
      "year": "2023",
      "publisher": "Nama penerbit",
      "isbn": "978-0000000000",
      "relevance": "Penjelasan relevansi dengan topik"
    }
  ],
  "websites": [
    {
      "title": "Judul sumber web",
      "url": "https://contoh.com/sumber",
      "type": "documentation",
      "source": "Nama website/organisasi",
      "relevance": "Penjelasan relevansi dengan topik"
    }
  ]
}

Syarat:
- Maksimal 2-3 item per kategori
- Sumber berkualitas akademik
- Relevan dengan kurikulum universitas Indonesia
- URL dan identifier yang realistis
- Respons harus JSON valid saja`,
        },
      ],
      max_completion_tokens: 1200,
      temperature: 0.1,
    });

    try {
      let content = response.choices[0].message.content.trim();

      // Clean up any potential formatting issues
      if (content.startsWith("```json")) {
        content = content.replace(/```json\s*/, "").replace(/```\s*$/, "");
      }
      if (content.startsWith("```")) {
        content = content.replace(/```\s*/, "").replace(/```\s*$/, "");
      }

      // Find JSON content if there's extra text
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonStart < jsonEnd) {
        content = content.substring(jsonStart, jsonEnd + 1);
      }

      const parsed = JSON.parse(content);

      // Validate and fix website URLs if validation is enabled
      const validatedWebsites =
        process.env.VALIDATE_EXTERNAL_URLS === "true"
          ? await validateWebsiteReferences(parsed.websites || [], query)
          : parsed.websites || [];

      return {
        journals: parsed.journals || [],
        books: parsed.books || [],
        websites: validatedWebsites,
      };
    } catch (parseError) {
      console.error("Failed to parse external references JSON:", parseError);
      console.error("Raw response:", response.choices[0].message.content);
      return {
        journals: [],
        books: [],
        websites: [],
      };
    }
  } catch (error) {
    console.error("Error generating external references:", error);
    return {
      journals: [],
      books: [],
      websites: [],
    };
  }
};

/**
 * Process all unprocessed documents for a course
 */
export const processAllCourseDocuments = async (courseId) => {
  try {
    const unprocessedContent = await prisma.content.findMany({
      where: {
        courseId,
        documentUrl: { not: null },
        isProcessed: false,
      },
    });

    console.log(
      `Found ${unprocessedContent.length} unprocessed documents for course ${courseId}`
    );

    const results = [];
    for (const content of unprocessedContent) {
      try {
        const result = await processDocument(content.contentId);
        results.push({ contentId: content.contentId, ...result });
      } catch (error) {
        results.push({
          contentId: content.contentId,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  } catch (error) {
    console.error(`Error processing course documents for ${courseId}:`, error);
    throw error;
  }
};

/**
 * Get embedding cache statistics
 */
export const getEmbeddingCacheStats = () => {
  return embeddingCache.getStats();
};

/**
 * Clear embedding cache
 */
export const clearEmbeddingCache = () => {
  return embeddingCache.clear();
};

/**
 * Get chat response with RAG context, conversation history, optional image, and optional document
 * (Backward compatibility wrapper - calls enhanced version)
 */
export const getChatResponseWithContext = async (
  userMessage,
  courseId,
  courseName,
  sessionId = null,
  fileContext = null
) => {
  // Call enhanced version with courseCode as courseName for backward compatibility
  const result = await getChatResponseWithContextAndReferences(
    userMessage,
    courseId,
    courseName,
    courseName, // Use courseName as courseCode fallback
    sessionId,
    fileContext,
    false // Disable external references for backward compatibility
  );

  // Return only the original fields for backward compatibility
  return {
    content: result.content,
    usage: result.usage,
    model: result.model,
    referencedDocuments: result.referencedDocuments,
  };
};
