import { PrismaClient } from "@prisma/client";
import { processDocument } from "./src/services/ragService.js";

const prisma = new PrismaClient();

async function fixEmbeddings() {
  try {
    console.log("🔧 Fixing embeddings storage...");

    // Find the ML course and content
    const course = await prisma.course.findFirst({
      where: { courseCode: "ML301" }
    });

    if (!course) {
      console.error("❌ ML301 course not found.");
      return;
    }

    const content = await prisma.content.findFirst({
      where: { 
        courseId: course.courseId,
        title: "Attention Is All You Need - Transformer Architecture"
      }
    });

    if (!content) {
      console.error("❌ Transformer paper content not found.");
      return;
    }

    console.log(`📄 Found content: ${content.title}`);

    // Delete existing chunks
    console.log("🗑️ Deleting existing chunks...");
    await prisma.documentChunk.deleteMany({
      where: { contentId: content.contentId }
    });

    // Mark content as unprocessed
    await prisma.content.update({
      where: { contentId: content.contentId },
      data: { isProcessed: false }
    });

    console.log("✅ Deleted existing chunks");

    // Re-process the document with fixed embedding storage
    console.log("🔄 Re-processing document with fixed embeddings...");
    const result = await processDocument(content.contentId);
    console.log("✅ Document re-processed:", result);

    // Verify the chunks are created properly
    const chunkCount = await prisma.documentChunk.count({
      where: { contentId: content.contentId }
    });

    console.log(`📊 Total chunks created: ${chunkCount}`);

    // Check a sample chunk
    const sampleChunk = await prisma.documentChunk.findFirst({
      where: { contentId: content.contentId },
      select: {
        chunkIndex: true,
        tokenCount: true,
        content: true,
        embeddings: true
      }
    });

    if (sampleChunk) {
      console.log("\n📝 Sample chunk:");
      console.log(`Chunk Index: ${sampleChunk.chunkIndex}`);
      console.log(`Token Count: ${sampleChunk.tokenCount}`);
      console.log(`Content preview: ${sampleChunk.content.substring(0, 200)}...`);
      console.log(`Embeddings type: ${typeof sampleChunk.embeddings}`);
      console.log(`Embeddings present: ${sampleChunk.embeddings ? 'Yes' : 'No'}`);
    }

    console.log("\n🎉 Embeddings fixed successfully!");

  } catch (error) {
    console.error("❌ Error fixing embeddings:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixEmbeddings();