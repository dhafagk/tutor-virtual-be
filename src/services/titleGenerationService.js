import OpenAI from "openai";

// Initialize OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a concise title for a chat session based on the first user message
 * Similar to how ChatGPT generates conversation titles
 * @param {string} firstMessage - The first message sent by the student
 * @param {string} courseName - The name of the course for context
 * @returns {Promise<string>} - Generated title
 */
export const generateSessionTitle = async (firstMessage, courseName) => {
  try {
    // Build cache-optimized prompt with static template first
    const staticTemplate = `Tugas Anda adalah membuat judul yang ringkas dan deskriptif (3-6 kata) untuk sebuah percakapan antara mahasiswa dan tutor AI.

**Kriteria Judul:**
1. **Singkat & Deskriptif:** Terdiri dari 3 sampai 6 kata.
2. **Fokus pada Topik:** Harus menangkap topik utama atau pertanyaan inti dari pesan mahasiswa.
3. **Relevan:** Sesuai dengan konteks mata kuliah yang diberikan.
4. **Kapitalisasi Judul:** Gunakan huruf kapital pada setiap awal kata penting (Title Case).
5. **Tanpa Tanda Kutip:** JANGAN menyertakan tanda kutip ("") pada hasil akhir.
6. **Bahasa:** Gunakan bahasa yang sama dengan bahasa yang digunakan dalam pesan mahasiswa.

**Contoh Judul yang Baik:**
- Konsep Normalisasi Database
- Pertanyaan tentang Implementasi Array
- Perbedaan Mitosis dan Meiosis
- Algoritma Machine Learning Dasar

**Informasi Konteks Spesifik:**
- **Mata Kuliah:** ${courseName}
- **Pesan Pertama Mahasiswa:** "${firstMessage}"

Hasilkan HANYA judulnya. Jangan tambahkan apa pun lagi.`;

    const prompt = staticTemplate;

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Anda adalah seorang ahli dalam membuat judul percakapan edukasional yang ringkas dan deskriptif. Tugas Anda HANYA menghasilkan judul, tanpa teks atau penjelasan tambahan.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_completion_tokens: 20,
      temperature: process.env.OPENAI_TEMPERATURE || 0.7,
    });

    let title = response.choices[0].message.content.trim();

    // Clean up the title - remove quotes if present
    title = title.replace(/^["']|["']$/g, "");

    // Ensure title is not too long (max 100 characters)
    if (title.length > 100) {
      title = title.substring(0, 97) + "...";
    }

    // Fallback if title is empty or too short
    if (!title || title.length < 3) {
      title = `Diskusi ${courseName}`;
    }

    return title;
  } catch (error) {
    console.error("Error generating session title:", error);

    // Fallback title generation based on first few words
    const words = firstMessage.split(" ").slice(0, 4);
    let fallbackTitle = words.join(" ");

    if (fallbackTitle.length > 50) {
      fallbackTitle = fallbackTitle.substring(0, 47) + "...";
    }

    return fallbackTitle || `${courseName} Chat`;
  }
};
