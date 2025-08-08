# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js backend service for an educational chatbot powered by OpenAI's ChatGPT with RAG (Retrieval-Augmented Generation). The system provides a REST API for managing student-tutor interactions with course-specific content.

## Development Commands

### Essential Commands

```bash
# Start development server with hot reload
npm run dev

# Start production server
npm start

# Database management
npm run prisma:generate    # Generate Prisma client after schema changes
npm run prisma:migrate     # Apply database migrations
npm run prisma:studio      # Open Prisma Studio database GUI
npm run prisma:seed        # Seed database with sample data

# Additional Prisma commands
npx prisma migrate dev --name migration_name  # Create new migration
npx prisma migrate reset                      # Reset database
npx prisma format                            # Format schema file
```

### Environment Setup

1. Copy `.env.example` to `.env`
2. Configure `DATABASE_URL` for PostgreSQL connection
3. Set `OPENAI_API_KEY` for ChatGPT integration
4. Set secure `JWT_SECRET`

## Architecture Overview

### Core Components

- **Express.js Server**: REST API with security middleware (Helmet, CORS, rate limiting)
- **Prisma ORM**: Database abstraction layer with PostgreSQL
- **JWT Authentication**: Token-based auth with role-based access (User/Admin)
- **OpenAI Integration**: ChatGPT API with RAG implementation
- **Vector Embeddings**: Uses pgvector extension for content similarity search

### Database Schema

Key entities and relationships:

- **User**: Base authentication with role field ("student" or "admin")
- **User** → **Admin**: One-to-one relationship for admin users
- **User** → **Student**: One-to-one relationship for student users
- **Course**: Course management with comprehensive details and content
- **Content**: Course materials with vector embeddings for RAG
- **DocumentChunk**: Processed chunks of documents for fine-grained RAG retrieval
- **ChatSession**: Persistent student-course chat sessions (no expiration)
- **Message**: Individual messages within sessions with references
- **Reference**: Links messages to specific document chunks for RAG context
- **TemporaryFile**: Staged file uploads for chat interactions

### API Routes Structure

- `/api/auth/*`: Authentication (register, login, logout, profile) - All roles
- `/api/student/*`: Student-specific operations (profile, courses, sessions, chat)
- `/api/chat/*`: Chat operations (deprecated - use `/api/student/chat` for students)
- `/api/admin/*`: Admin operations (dashboard, course/content/user management, analytics)
- `/health`: Health check endpoint

### User Roles and Access

- **Students**: Can login, access detailed course information, start course-specific chats, send messages, view/delete their own chat sessions, upload files for chat context
- **Admins**: Full access to system management, analytics, and all student data

### Course System Features

- **Comprehensive Course Details**: Each course includes learning objectives, competencies, prerequisites, teaching methods, evaluation criteria, references, and topic modules
- **Course-Specific Chat Sessions**: Students must select a course before starting a chat session for better tracking and context
- **Persistent Sessions**: Chat sessions remain active indefinitely until manually deleted by students
- **Session Management**: Students can continue any existing session or delete unwanted sessions completely
- **Rich Course Information**: Students can view detailed course information including syllabus, references, and learning materials
- **Intelligent Document Retrieval (RAG)**: AI automatically finds and uses relevant course documents as context for student questions
- **Document Search & Browse**: Students can search and explore course materials before or during chat sessions
- **Smart Context Generation**: AI responses include information about which course documents were referenced
- **File Upload Support**: Students can upload images and documents to provide additional context in chat sessions

### Refactored Architecture

The codebase follows a clean MVC pattern:

- **Controllers**: Business logic separated from routes (`src/controllers/`)
- **Middleware**: Centralized validation and error handling (`src/middleware/`)
- **Routes**: Clean route definitions with proper middleware chaining (`src/routes/`)
- **Error Handling**: Centralized error handling with proper HTTP status codes
- **Validation**: Consistent validation patterns using express-validator

### Key Design Patterns

1. **RAG Implementation**: Uses course content with vector embeddings for contextual responses
2. **Session Management**: Persistent chat sessions per student-course combination (no expiration/end state)
3. **File Staging**: Temporary file uploads with expiration for chat context
4. **Cascade Deletion**: Database relationships ensure complete cleanup when sessions are deleted
5. **Middleware Chain**: Security → Authentication → Authorization → Validation
6. **Error Handling**: Centralized error handling with proper HTTP status codes

### Security Features

- JWT token authentication with expiration
- Password hashing with bcrypt
- Input validation using express-validator
- Rate limiting to prevent abuse
- SQL injection protection via Prisma ORM

## Development Notes

### Database Considerations

- Uses PostgreSQL with `uuid_ossp` and `vector` extensions
- Vector embeddings stored as `vector(1536)` for OpenAI embeddings
- Proper indexing on foreign keys and search fields
- Cascade delete relationships ensure data integrity when sessions are removed
- No session expiration - sessions persist until manually deleted

### OpenAI Integration

- Configurable model (default: gpt-4o-mini)
- System prompts include course context from RAG
- Conversation history maintained per session
- Usage tracking included in responses
- Support for image and document analysis in chat context
- File processing through temporary staging system

### Environment Variables

Required: `DATABASE_URL`, `OPENAI_API_KEY`, `JWT_SECRET`
Optional: `PORT`, `NODE_ENV`, rate limiting settings, OpenAI model parameters

### Test Credentials (from seed data)

**Admin Account:**

- Username: `admin1`
- Password: `admin123`
- Role: admin

**Student Accounts:**

- Username: `student1`, Password: `student123` (John Doe, CS, Semester 5)
- Username: `student2`, Password: `student123` (Jane Smith, IS, Semester 3)

### Testing

No test framework currently configured. Consider adding Jest or similar for unit/integration tests.

### Known Limitations

- RAG implementation is basic (fetches all course content, no vector search)
- Vector embeddings are not currently generated (commented out to avoid API costs)
- No password reset functionality
- No refresh token implementation
