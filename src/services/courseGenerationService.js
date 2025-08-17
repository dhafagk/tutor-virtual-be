import OpenAI from "openai";

// Initialize OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate course fields using OpenAI
 */
export const generateCourseFields = async (courseName) => {
  try {
    const prompt = `Kamu adalah seorang ahli kurikulum pendidikan tinggi di Indonesia. Berdasarkan nama mata kuliah "${courseName}", buatlah informasi lengkap mata kuliah dalam bahasa Indonesia dengan format JSON berikut:

{
  "description": "Deskripsi singkat mata kuliah (2-3 kalimat)",
  "objectives": "Tujuan pembelajaran mata kuliah (dalam bentuk paragraf)",
  "competencies": "Kompetensi yang akan dicapai mahasiswa setelah menyelesaikan mata kuliah (dalam bentuk paragraf dengan poin-poin)",
  "prerequisites": "Prasyarat mata kuliah (jika ada, jika tidak ada tulis 'Tidak ada prasyarat khusus')",
  "topics": "Topik-topik utama yang akan dipelajari (dalam bentuk array string, 8-12 topik)"
}

Jawab hanya dalam format JSON yang valid tanpa penjelasan tambahan.`;

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Kamu adalah asisten ahli kurikulum pendidikan tinggi Indonesia. Berikan respons dalam format JSON yang valid.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_completion_tokens: 1500,
      reasoning_effort: "medium",
      verbosity: "medium",
    });

    const generatedContent = response.choices[0].message.content.trim();

    // Parse JSON response
    let parsedContent;
    try {
      // Remove markdown code block if present
      const cleanContent = generatedContent.replace(/```json\n?|\n?```/g, "");
      parsedContent = JSON.parse(cleanContent);
    } catch (parseError) {
      throw new Error(`Failed to parse OpenAI response: ${parseError.message}`);
    }

    // Validate required fields
    const requiredFields = [
      "description",
      "objectives",
      "competencies",
      "prerequisites",
      "topics",
    ];

    for (const field of requiredFields) {
      if (!parsedContent[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate topics is an array
    if (!Array.isArray(parsedContent.topics)) {
      throw new Error("Topics must be an array");
    }

    // Convert topics array to JSON string for database storage
    const result = {
      ...parsedContent,
      topics: JSON.stringify(parsedContent.topics),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Course fields generation error:", error);

    return {
      success: false,
      error: error.message || "Failed to generate course fields",
      details: error,
    };
  }
};

/**
 * Generate course content recommendations using OpenAI
 */
export const generateCourseContent = async (courseName) => {
  try {
    const prompt = `Kamu adalah seorang ahli kurikulum pendidikan tinggi di Indonesia. Berdasarkan nama mata kuliah "${courseName}", buatlah daftar konten pembelajaran dalam bahasa Indonesia dengan format JSON berikut:

{
  "contentList": [
    {
      "title": "Judul Materi/Buku/Jurnal/Resource",
      "description": "Deskripsi detail tentang konten ini dan relevansinya dengan mata kuliah (2-3 kalimat)",
      "documentUrl": "URL yang valid jika tersedia (untuk buku online, jurnal open access, atau website), atau null jika tidak ada URL",
      "documentType": "book/journal/article/website/pdf/video/presentation"
    }
  ]
}

Untuk contentList:
- Berikan minimal 10-15 konten berkualitas tinggi
- Prioritaskan referensi dalam bahasa Indonesia atau yang membahas konteks Indonesia
- Jika ada referensi bahasa Inggris yang lebih relevan dan berkualitas tinggi, sertakan juga
- Untuk buku: sertakan buku teks standar, buku referensi utama
- Untuk jurnal: sertakan jurnal ilmiah yang relevan dan dapat diakses
- Untuk website: sertakan resource online berkualitas seperti dokumentasi resmi, tutorial, course online
- Untuk documentUrl: berikan URL yang valid dan dapat diakses, atau null jika tidak tersedia
- Variasikan jenis documentType untuk memberikan beragam sumber pembelajaran

Jawab hanya dalam format JSON yang valid tanpa penjelasan tambahan.`;

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Kamu adalah asisten ahli kurikulum pendidikan tinggi Indonesia. Berikan respons dalam format JSON yang valid.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_completion_tokens: 2000,
      reasoning_effort: "medium",
      verbosity: "medium",
    });

    const generatedContent = response.choices[0].message.content.trim();

    // Parse JSON response
    let parsedContent;
    try {
      // Remove markdown code block if present
      const cleanContent = generatedContent.replace(/```json\n?|\n?```/g, "");
      parsedContent = JSON.parse(cleanContent);
    } catch (parseError) {
      throw new Error(`Failed to parse OpenAI response: ${parseError.message}`);
    }

    // Validate required fields
    const requiredFields = ["contentList"];

    for (const field of requiredFields) {
      if (!parsedContent[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate contentList is an array
    if (!Array.isArray(parsedContent.contentList)) {
      throw new Error("Content list must be an array");
    }

    // Validate content items have required fields
    for (const content of parsedContent.contentList) {
      if (!content.title || !content.description) {
        throw new Error("Each content item must have title and description");
      }
    }

    const result = {
      contentList: parsedContent.contentList,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Course content generation error:", error);

    return {
      success: false,
      error: error.message || "Failed to generate course content",
      details: error,
    };
  }
};
