import { PrismaClient } from "@prisma/client";
import { findSimilarChunks } from "./src/services/ragService.js";

const prisma = new PrismaClient();

async function debugSimilaritySearch() {
  try {
    console.log("🔍 Debugging Similarity Search...");

    // Find ML301 course
    const course = await prisma.course.findFirst({
      where: { courseCode: "ML301" }
    });

    if (!course) {
      console.error("❌ ML301 course not found");
      return;
    }

    console.log(`✅ Found course: ${course.courseName}`);

    // Check processed content
    const processedContent = await prisma.content.findMany({
      where: {
        courseId: course.courseId,
        isProcessed: true
      }
    });

    console.log(`📚 Processed content count: ${processedContent.length}`);
    processedContent.forEach(content => {
      console.log(`  - ${content.title} (${content.isProcessed ? 'Processed' : 'Not processed'})`);
    });

    // Check document chunks
    const chunkCount = await prisma.documentChunk.count({
      where: {
        document: {
          courseId: course.courseId
        }
      }
    });

    console.log(`📄 Total chunks in course: ${chunkCount}`);

    // Test various queries
    const testQueries = [
      "apakah ada dokumen materi pembelajaran?",
      "What is the Transformer architecture?",
      "attention mechanism",
      "neural network",
      "transformer model"
    ];

    console.log("\n🧪 Testing similarity search with different queries:");

    for (const query of testQueries) {
      console.log(`\n🔎 Query: "${query}"`);
      
      try {
        console.log(`  🔄 Testing similarity search...`);

        // Test similarity search
        const similarChunks = await findSimilarChunks(query, course.courseId);
        console.log(`  📊 Found ${similarChunks.length} similar chunks`);

        if (similarChunks.length > 0) {
          console.log("  🎯 Top matches:");
          similarChunks.slice(0, 3).forEach((chunk, index) => {
            console.log(`    ${index + 1}. Similarity: ${(chunk.similarity * 100).toFixed(1)}%`);
            console.log(`       Content preview: ${chunk.content.substring(0, 100)}...`);
            console.log(`       Document: ${chunk.document.title}`);
          });
        } else {
          console.log("  ❌ No matches found above threshold (30%)");
          
          console.log("  📉 Let's check if embeddings exist in the database...");
        }
      } catch (error) {
        console.error(`  ❌ Error testing query "${query}":`, error.message);
      }
    }

  } catch (error) {
    console.error("❌ Error during debug:", error);
  } finally {
    await prisma.$disconnect();
  }
}

debugSimilaritySearch();