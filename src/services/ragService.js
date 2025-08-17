import OpenAI from "openai";
import { prisma } from "../lib/prisma.js";
import PDFParser from "pdf-parse";
import mammoth from "mammoth";

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

/**
 * Estimate token count for text (rough approximation: 1 token ≈ 4 characters)
 */
const estimateTokenCount = (text) => {
  return Math.ceil(text.length / 4);
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
 * Generate embeddings for text using OpenAI
 */
const generateEmbeddings = async (text) => {
  try {
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    return response.data[0].embedding;
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
 * Find similar chunks using vector similarity search
 */
export const findSimilarChunks = async (
  queryText,
  courseId,
  limit = MAX_CHUNKS_PER_QUERY
) => {
  try {
    // Generate embeddings for the query
    const queryEmbeddings = await generateEmbeddings(queryText);
    const embeddingVector = `[${queryEmbeddings.join(",")}]`;

    // Step 1: Get all chunks with their similarities (no threshold yet)
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
      ORDER BY dc.embeddings <=> ${embeddingVector}::vector
      LIMIT ${limit * 3}
    `;

    // Step 2: Apply similarity threshold and filter
    const filteredChunks = allChunks
      .filter((chunk) => parseFloat(chunk.similarity) > SIMILARITY_THRESHOLD)
      .slice(0, limit); // Final limit

    if (filteredChunks.length === 0) {
      console.log(
        `⚠️  No chunks found above ${(SIMILARITY_THRESHOLD * 100).toFixed(
          0
        )}% similarity threshold`
      );
      return [];
    }

    return filteredChunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.pageNumber,
      similarity: chunk.similarity,
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
          model: "gpt-4o-mini",
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
      model: "gpt-4o-mini",
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
 * Get chat response with RAG context, conversation history, optional image, and optional document
 */
export const getChatResponseWithContext = async (
  userMessage,
  courseId,
  courseName,
  sessionId = null,
  fileContext = null // Can contain both image and document contexts
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

    // Find relevant chunks
    const relevantChunks = await findSimilarChunks(userMessage, courseId);

    // Get conversation history if sessionId is provided
    const conversationHistory = sessionId
      ? await getConversationHistory(sessionId)
      : [];

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

      systemPrompt = `Anda adalah seorang tutor AI ahli untuk mata kuliah "${courseName}".
Peran utama Anda adalah membantu mahasiswa memahami materi, bukan memberikan jawaban instan untuk tugas.

Anda memiliki akses ke dokumen dan materi pembelajaran berikut yang relevan dengan pertanyaan mahasiswa:

${finalContextSections}${allFileContexts}

Gunakan informasi dari dokumen di atas${
        processedImageContext || processedDocumentContext
          ? " DAN file yang diunggah mahasiswa"
          : ""
      } untuk menjalankan tugas-tugas berikut:
1. Jawab pertanyaan mahasiswa secara akurat dan membantu berdasarkan materi yang tersedia.
2. Jika pertanyaan mahasiswa bersifat ambigu, ajukan pertanyaan klarifikasi sebelum menjawab.
3. Untuk konsep yang sulit, gunakan contoh atau analogi dari materi yang ada untuk menjelaskannya.
4. Jika pertanyaan menanyakan jawaban langsung untuk soal ujian atau tugas, JANGAN berikan jawabannya. Alih-alih, bimbing mahasiswa dengan memberikan petunjuk, menjelaskan konsep terkait, dan mengajukan pertanyaan pancingan untuk mendorong mereka berpikir.
5. Jika informasi yang dibutuhkan untuk menjawab tidak ada dalam dokumen yang diberikan, nyatakan dengan jujur bahwa Anda tidak memiliki informasi tersebut dalam materi yang tersedia.
6. Selalu sebutkan dokumen mana yang Anda gunakan sebagai referensi dalam jawaban Anda.

Gaya Komunikasi:
- Selalu bersikap positif, sabar, dan mendorong.
- Gunakan Bahasa Indonesia yang baik, benar, dan mudah dipahami.
- Strukturkan jawaban yang panjang dengan poin-poin agar mudah dibaca.
- Berikan referensi ke dokumen yang digunakan.`;
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
      temperature: process.env.OPENAI_TEMPERATURE || 0.7,
    });

    return {
      content: response.choices[0].message.content,
      usage: response.usage,
      model: response.model,
      referencedDocuments: referencedDocuments.slice(0, 3), // Limit to top 3 references
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
