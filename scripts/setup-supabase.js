import { execSync } from "child_process";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

console.log("🚀 Setting up Supabase database...\n");

try {
  // Check if DATABASE_URL is configured
  if (
    !process.env.DATABASE_URL ||
    process.env.DATABASE_URL.includes("[YOUR-")
  ) {
    console.error(
      "❌ Please configure your Supabase DATABASE_URL in .env file"
    );
    console.log("\nSteps:");
    console.log("1. Create a project at https://supabase.com");
    console.log("2. Go to Settings → Database");
    console.log("3. Copy the Connection string (URI)");
    console.log("4. Update DATABASE_URL in your .env file");
    process.exit(1);
  }

  // Generate Prisma Client
  console.log("📦 Generating Prisma Client...");
  execSync("npx prisma generate", { stdio: "inherit" });

  // Push schema to Supabase
  console.log("\n📤 Pushing schema to Supabase...");
  execSync("npx prisma db push", { stdio: "inherit" });

  // Run seed script
  console.log("\n🌱 Seeding database...");
  execSync("npm run prisma:seed", { stdio: "inherit" });

  console.log("\n✅ Supabase setup complete!");
  console.log("\nYou can now:");
  console.log("- Run `npm run dev` to start the server");
  console.log("- Visit Supabase dashboard to view your data");
  console.log("- Use `npx prisma studio` to browse your database");
} catch (error) {
  console.error("\n❌ Setup failed:", error.message);
  console.log("\nTroubleshooting:");
  console.log("- Make sure your Supabase project is fully provisioned");
  console.log("- Check your DATABASE_URL is correct");
  console.log(
    "- Ensure uuid-ossp and vector extensions are enabled in Supabase"
  );
  process.exit(1);
}
