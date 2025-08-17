import OpenAI from "openai";
import { prisma } from "../lib/prisma.js";

// Initialize OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate suggestion prompts for a course based on course info and available documents
 * @param {string} courseId - The course ID
 * @returns {Promise<string[]>} Array of suggestion prompts
 */
export const generateCourseSuggestions = async (courseId) => {
  try {
    console.log(`🤖 Generating suggestion prompts for course: ${courseId}`);

    // Get course information with content
    const course = await prisma.course.findUnique({
      where: { courseId },
      include: {
        contents: {
          where: { isProcessed: true },
          select: {
            title: true,
            description: true,
            documentType: true,
          },
          take: 3, // Limit to avoid too much context
        },
      },
    });

    if (!course) {
      throw new Error("Course not found");
    }

    // Build context about the course
    let courseContext = `Mata Kuliah: ${course.courseName}`;

    if (course.description) {
      courseContext += `\nDeskripsi: ${course.description}`;
    }

    if (course.objectives) {
      courseContext += `\nTujuan Pembelajaran: ${course.objectives}`;
    }

    if (course.competencies) {
      courseContext += `\nKompetensi: ${course.competencies}`;
    }

    // Add available documents information
    let documentsContext = "";
    if (course.contents && course.contents.length > 0) {
      documentsContext = "\n\nDokumen/Materi yang Tersedia:\n";
      course.contents.forEach((content, index) => {
        documentsContext += `${index + 1}. ${content.title}`;
        if (content.description) {
          documentsContext += ` - ${content.description.substring(0, 100)}${
            content.description.length > 100 ? "..." : ""
          }`;
        }
        documentsContext += `\n`;
      });
    }

    const fullContext = courseContext + documentsContext;

    // Generate suggestions using OpenAI
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Anda adalah asisten AI yang membantu mahasiswa memulai percakapan dengan tutor virtual untuk mata kuliah tertentu.

Tugas Anda: Berikan 3 saran pertanyaan yang menarik dan relevan yang dapat diajukan mahasiswa untuk memulai sesi belajar.

Panduan:
1. Buat pertanyaan yang spesifik dan actionable
2. Gunakan informasi mata kuliah dan dokumen yang tersedia
3. Variasikan jenis pertanyaan (konsep dasar, penerapan, studi kasus, problem solving)
4. Gunakan Bahasa Indonesia yang natural dan mudah dipahami
5. Jangan terlalu panjang - maksimal 15 kata per saran
6. Fokus pada hal-hal yang mungkin ingin ditanyakan mahasiswa

Format respons sebagai array JSON dengan format:
["Pertanyaan 1", "Pertanyaan 2", "Pertanyaan 3"]

Contoh yang BAIK:
- "Apa perbedaan antara algoritma sorting bubble sort dan quick sort?"
- "Bagaimana cara mengimplementasikan database normalization?"
- "Jelaskan konsep dasar machine learning untuk pemula"

Contoh yang BURUK (terlalu umum):
- "Apa itu programming?"
- "Bagaimana cara belajar?"`,
        },
        {
          role: "user",
          content: `Buatkan saran pertanyaan untuk mata kuliah berikut:

${fullContext}

Berikan 3 saran pertanyaan yang relevan dalam format JSON array.`,
        },
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    const responseContent = response.choices[0].message.content.trim();

    try {
      // Try to parse as JSON
      const suggestions = JSON.parse(responseContent);

      if (Array.isArray(suggestions) && suggestions.length > 0) {
        console.log(
          `✅ Generated ${suggestions.length} suggestion prompts for course: ${course.courseName}`
        );
        return suggestions.slice(0, 6); // Ensure max 6 suggestions
      } else {
        throw new Error("Invalid response format");
      }
    } catch (parseError) {
      console.error("Error parsing AI response as JSON:", parseError);

      // Fallback: try to extract suggestions from text
      const lines = responseContent
        .split("\n")
        .filter(
          (line) =>
            line.trim().length > 0 && (line.includes('"') || line.includes("-"))
        )
        .map((line) =>
          line
            .replace(/^[\d\.\-\*\s]*["']?/, "")
            .replace(/["']?[\,\s]*$/, "")
            .trim()
        )
        .filter((line) => line.length > 10)
        .slice(0, 6);

      if (lines.length > 0) {
        console.log(
          `✅ Generated ${lines.length} suggestion prompts (fallback parsing) for course: ${course.courseName}`
        );
        return lines;
      }

      // Final fallback with generic suggestions
      return generateFallbackSuggestions(course);
    }
  } catch (error) {
    console.error(
      `Error generating suggestions for course ${courseId}:`,
      error
    );

    // Try to get course info for fallback
    try {
      const course = await prisma.course.findUnique({
        where: { courseId },
        select: { courseName: true, description: true },
      });

      if (course) {
        return generateFallbackSuggestions(course);
      }
    } catch (fallbackError) {
      console.error("Error generating fallback suggestions:", fallbackError);
    }

    // Ultimate fallback
    return [
      "Apa topik utama yang akan dipelajari dalam mata kuliah ini?",
      "Bagaimana cara memulai belajar materi dasar?",
      "Apa yang perlu dipersiapkan untuk mengikuti mata kuliah ini?",
    ];
  }
};

/**
 * Generate fallback suggestions when AI generation fails
 * @param {Object} course - Course object with basic info
 * @returns {string[]} Array of fallback suggestions
 */
const generateFallbackSuggestions = (course) => {
  const courseName = course.courseName || "mata kuliah ini";

  const fallbackSuggestions = [
    `Apa topik utama yang dipelajari dalam ${courseName}?`,
    `Bagaimana cara memulai belajar ${courseName} dari dasar?`,
    `Apa konsep fundamental yang penting dalam ${courseName}?`,
  ];

  console.log(`⚠️ Using fallback suggestions for course: ${courseName}`);
  return fallbackSuggestions;
};

/**
 * Generate quick suggestions without AI (for faster response)
 * @param {Object} course - Course object
 * @returns {string[]} Array of quick suggestions
 */
export const generateQuickSuggestions = (course) => {
  const courseName = course.courseName || "mata kuliah ini";

  return [
    `Apa yang akan dipelajari dalam ${courseName}?`,
    `Bagaimana cara memulai belajar materi dasar?`,
    `Apa konsep penting yang harus dipahami?`,
  ];
};
