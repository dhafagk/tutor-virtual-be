import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Start seeding...");

  // Create users
  const hashedPassword1 = await bcrypt.hash("admin123", 10);
  const hashedPassword2 = await bcrypt.hash("student123", 10);

  const adminUser = await prisma.user.create({
    data: {
      username: "admin1",
      password: hashedPassword1,
      email: "admin1@university.edu",
      role: "admin",
    },
  });

  const studentUser1 = await prisma.user.create({
    data: {
      username: "student1",
      password: hashedPassword2,
      email: "student1@university.edu",
      role: "student",
    },
  });

  const studentUser2 = await prisma.user.create({
    data: {
      username: "student2",
      password: hashedPassword2,
      email: "student2@university.edu",
      role: "student",
    },
  });

  // Create admin
  await prisma.admin.create({
    data: {
      userId: adminUser.userId,
      role: "super_admin",
      permissions: {
        manageUsers: true,
        manageContent: true,
        viewAnalytics: true,
      },
    },
  });

  // Create students
  const student1 = await prisma.student.create({
    data: {
      studentId: "123456789",
      userId: studentUser1.userId,
      name: "John Doe",
      program: "Computer Science",
      semester: 5,
    },
  });

  const student2 = await prisma.student.create({
    data: {
      studentId: "987654321",
      userId: studentUser2.userId,
      name: "Jane Smith",
      program: "Information Systems",
      semester: 3,
    },
  });

  // Create courses with comprehensive details
  const course1 = await prisma.course.create({
    data: {
      courseCode: "CS101",
      courseName: "Introduction to Programming",
      description: "Basic programming concepts using Python",
      courseDetails:
        "This course introduces students to fundamental programming concepts using Python. Students will learn problem-solving techniques, algorithm design, and software development best practices. The course covers basic syntax, data types, control structures, functions, and object-oriented programming principles.",
      objectives:
        "To provide students with a solid foundation in programming concepts and Python language, enabling them to solve computational problems and develop simple applications.",
      competencies:
        "After completing this course, students will be able to: 1) Write well-structured Python programs, 2) Apply problem-solving methodologies, 3) Understand basic algorithms and data structures, 4) Debug and test programs effectively.",
      prerequisites:
        "Basic mathematics and logical thinking. No prior programming experience required.",
      teachingMethods:
        "Lectures, hands-on programming labs, coding assignments, and project-based learning.",
      evaluation:
        "Assignments (30%), Mid-term exam (25%), Final project (25%), Final exam (20%)",
      references:
        "1. Python Crash Course by Eric Matthes, 2. Automate the Boring Stuff with Python by Al Sweigart, 3. Think Python by Allen B. Downey",
      topics: JSON.stringify([
        "Python Basics and Syntax",
        "Variables and Data Types",
        "Control Structures (if/else, loops)",
        "Functions and Modules",
        "Lists, Tuples, and Dictionaries",
        "File Handling",
        "Error Handling and Debugging",
        "Object-Oriented Programming Basics",
        "Final Project Development",
      ]),
      duration: 16,
      semester: 1,
      faculty: "Faculty of Computer Science",
      department: "Computer Science",
      instructor: "Dr. Sarah Johnson",
      credits: 3,
    },
  });

  const course2 = await prisma.course.create({
    data: {
      courseCode: "CS201",
      courseName: "Data Structures and Algorithms",
      description: "Fundamental data structures and algorithms",
      courseDetails:
        "This course covers essential data structures and algorithms used in computer science. Students will learn about arrays, linked lists, stacks, queues, trees, graphs, and various sorting and searching algorithms. The course emphasizes both theoretical understanding and practical implementation.",
      objectives:
        "To equip students with knowledge of fundamental data structures and algorithms, enabling them to choose appropriate data structures for different problems and analyze algorithm efficiency.",
      competencies:
        "Students will be able to: 1) Implement various data structures, 2) Analyze time and space complexity, 3) Choose appropriate algorithms for different problems, 4) Design efficient solutions for computational problems.",
      prerequisites: "CS101 - Introduction to Programming, Basic Mathematics",
      teachingMethods:
        "Theoretical lectures, practical programming sessions, algorithm analysis workshops, and coding competitions.",
      evaluation:
        "Programming assignments (35%), Quizzes (15%), Mid-term exam (25%), Final exam (25%)",
      references:
        "1. Introduction to Algorithms by Cormen, Leiserson, Rivest, and Stein, 2. Data Structures and Algorithms in Python by Goodrich, Tamassia, and Goldwasser",
      topics: JSON.stringify([
        "Algorithm Analysis and Big O Notation",
        "Arrays and Dynamic Arrays",
        "Linked Lists",
        "Stacks and Queues",
        "Recursion",
        "Trees and Binary Search Trees",
        "Heaps and Priority Queues",
        "Hash Tables",
        "Graphs and Graph Algorithms",
        "Sorting Algorithms",
        "Searching Algorithms",
      ]),
      duration: 16,
      semester: 3,
      faculty: "Faculty of Computer Science",
      department: "Computer Science",
      instructor: "Prof. Michael Chen",
      credits: 4,
    },
  });

  const course3 = await prisma.course.create({
    data: {
      courseCode: "IS301",
      courseName: "Database Systems",
      description: "Database design and implementation with SQL",
      courseDetails:
        "This course provides comprehensive coverage of database systems, including relational database design, SQL programming, normalization, transaction management, and database administration. Students will learn to design, implement, and manage database systems for real-world applications.",
      objectives:
        "To provide students with theoretical knowledge and practical skills in database design, implementation, and management using modern database management systems.",
      competencies:
        "Students will master: 1) Database design principles and normalization, 2) SQL programming for data manipulation and querying, 3) Database administration and optimization, 4) Transaction management and concurrency control.",
      prerequisites:
        "Basic programming knowledge, Introduction to Information Systems",
      teachingMethods:
        "Lectures with case studies, hands-on database labs, SQL programming exercises, and database design projects.",
      evaluation:
        "Database design project (30%), SQL assignments (25%), Mid-term exam (20%), Final exam (25%)",
      references:
        "1. Database System Concepts by Silberschatz, Korth, and Sudarshan, 2. Learning SQL by Alan Beaulieu, 3. Database Design for Mere Mortals by Michael J. Hernandez",
      topics: JSON.stringify([
        "Introduction to Database Systems",
        "Relational Model and Algebra",
        "Entity-Relationship Modeling",
        "Database Normalization",
        "SQL Fundamentals",
        "Advanced SQL Queries",
        "Stored Procedures and Functions",
        "Indexing and Query Optimization",
        "Transaction Management",
        "Database Security",
        "NoSQL Databases Overview",
      ]),
      duration: 16,
      semester: 5,
      faculty: "Faculty of Information Systems",
      department: "Information Systems",
      instructor: "Dr. Emily Rodriguez",
      credits: 3,
    },
  });

  const course4 = await prisma.course.create({
    data: {
      courseCode: "ML301",
      courseName: "Machine Learning and Neural Networks",
      description:
        "Advanced course covering machine learning algorithms and neural network architectures",
      courseDetails:
        "This course covers advanced machine learning concepts including deep learning, attention mechanisms, transformers, and modern neural network architectures. Students will learn both theoretical foundations and practical implementations.",
      objectives:
        "To provide students with comprehensive understanding of modern machine learning techniques and neural network architectures.",
      competencies:
        "Students will be able to understand and implement transformer architectures, attention mechanisms, and other advanced ML models.",
      prerequisites: "Linear Algebra, Statistics, Programming Experience",
      teachingMethods:
        "Lectures, hands-on coding sessions, research paper discussions",
      evaluation: "Assignments (40%), Mid-term (25%), Final Project (35%)",
      references:
        "1. Deep Learning by Ian Goodfellow, 2. Attention Is All You Need paper, 3. Pattern Recognition and Machine Learning by Christopher Bishop",
      topics: JSON.stringify([
        "Neural Network Fundamentals",
        "Deep Learning Architectures",
        "Attention Mechanisms",
        "Transformer Architecture",
        "BERT and GPT Models",
        "Computer Vision Applications",
        "Natural Language Processing",
        "Transfer Learning",
      ]),
      duration: 16,
      semester: 7,
      faculty: "Faculty of Computer Science",
      department: "Computer Science",
      instructor: "Dr. Alex Thompson",
      credits: 4,
    },
  });

  // Create sample content for courses
  await prisma.content.createMany({
    data: [
      {
        courseId: course1.courseId,
        title: "Python Programming Basics",
        description:
          "Python is a high-level programming language known for its simplicity and readability.",
        documentUrl: "https://docs.python.org/3/tutorial/",
      },
      {
        courseId: course1.courseId,
        title: "Python Variables",
        description:
          "Variables in Python are dynamically typed and do not need explicit declaration.",
        documentUrl:
          "https://docs.python.org/3/tutorial/introduction.html#using-python-as-a-calculator",
      },
      {
        courseId: course2.courseId,
        title: "Arrays Data Structure",
        description:
          "Arrays are fundamental data structures that store elements in contiguous memory locations.",
        documentUrl: "https://en.wikipedia.org/wiki/Array_data_structure",
      },
      {
        courseId: course2.courseId,
        title: "Linked Lists",
        description:
          "Linked lists are linear data structures where elements are connected using pointers.",
        documentUrl: "https://en.wikipedia.org/wiki/Linked_list",
      },
      {
        courseId: course3.courseId,
        title: "SQL Introduction",
        description:
          "SQL (Structured Query Language) is used to manage and manipulate relational databases.",
        documentUrl: "https://www.w3schools.com/sql/",
      },
      {
        courseId: course3.courseId,
        title: "Database Normalization",
        description:
          "Normalization is the process of organizing data to minimize redundancy.",
        documentUrl: "https://en.wikipedia.org/wiki/Database_normalization",
      },
      {
        courseId: course4.courseId,
        title: "Attention Is All You Need",
        description:
          "Original research paper introducing the Transformer architecture that revolutionized natural language processing and machine learning.",
        documentUrl:
          "https://proceedings.neurips.cc/paper_files/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf",
      },
    ],
  });

  console.log("Seeding finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
