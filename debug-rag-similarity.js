import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

const prisma = new PrismaClient();
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function debugRAGSimilarity() {
  try {
    console.log("🔍 Debugging RAG similarity scores...");

    // Find the ML course
    const course = await prisma.course.findFirst({
      where: { courseCode: "ML301" }
    });

    if (!course) {
      console.error("❌ ML301 course not found.");
      return;
    }

    const query = "What is the Transformer architecture?";
    console.log(`Query: "${query}"`);

    // Generate embeddings for the query
    console.log("🔄 Generating query embeddings...");
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbeddings = response.data[0].embedding;
    const embeddingVector = `[${queryEmbeddings.join(",")}]`;

    // Check all chunks with their similarity scores (no threshold)
    console.log("🔄 Finding all chunks with similarity scores...");
    const allChunks = await prisma.$queryRaw`
      SELECT 
        dc."chunkId",
        dc."contentId",
        dc."chunkIndex",
        dc.content,
        dc."tokenCount",
        c.title as document_title,
        c."documentUrl" as document_url,
        co."courseName" as course_name,
        co."courseCode" as course_code,
        (1 - (dc.embeddings <=> ${embeddingVector}::vector)) as similarity
      FROM document_chunks dc
      JOIN contents c ON dc."contentId" = c."contentId"
      JOIN courses co ON c."courseId" = co."courseId"
      WHERE c."courseId" = ${course.courseId}::uuid
        AND c."isProcessed" = true
        AND dc.embeddings IS NOT NULL
      ORDER BY dc.embeddings <=> ${embeddingVector}::vector
      LIMIT 10
    `;

    console.log(`\n📊 Found ${allChunks.length} chunks. Top similarities:`);
    
    allChunks.forEach((chunk, index) => {
      const similarity = parseFloat(chunk.similarity);
      console.log(`${index + 1}. Chunk ${chunk.chunkIndex}: Similarity = ${similarity.toFixed(4)} (${(similarity * 100).toFixed(2)}%)`);
      console.log(`   Document: ${chunk.document_title}`);
      console.log(`   Content preview: ${chunk.content.substring(0, 200)}...`);
      console.log();
    });

    // Check the current threshold
    const SIMILARITY_THRESHOLD = 0.7;
    console.log(`\n🎯 Current similarity threshold: ${SIMILARITY_THRESHOLD} (${(SIMILARITY_THRESHOLD * 100)}%)`);
    
    const aboveThreshold = allChunks.filter(chunk => parseFloat(chunk.similarity) > SIMILARITY_THRESHOLD);
    console.log(`📈 Chunks above threshold: ${aboveThreshold.length}`);

    // Suggest a better threshold
    if (allChunks.length > 0) {
      const maxSimilarity = Math.max(...allChunks.map(chunk => parseFloat(chunk.similarity)));
      const suggestedThreshold = Math.max(0.1, maxSimilarity * 0.7); // 70% of max similarity, but at least 0.1
      console.log(`💡 Suggested threshold: ${suggestedThreshold.toFixed(3)} (${(suggestedThreshold * 100).toFixed(1)}%)`);
    }

  } catch (error) {
    console.error("❌ Error debugging RAG similarity:", error);
  } finally {
    await prisma.$disconnect();
  }
}

debugRAGSimilarity();