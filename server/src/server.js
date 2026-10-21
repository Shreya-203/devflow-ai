require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const prisma = new PrismaClient();

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
// Validate an optional GitHub repository URL
function validateGithubUrl(value) {
    if (value === undefined || value === null || value === "") {
        return true;
    }

    if (typeof value !== "string" || value.length > 500) {
        return false;
    }

    try {
        const url = new URL(value);

        return (
            url.protocol === "https:" &&
            url.hostname === "github.com" &&
            url.pathname.split("/").filter(Boolean).length >= 2
        );
    } catch {
        return false;
    }
}
// Initialize Gemini AI
let ai = null;

if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
    });

    console.log("Gemini AI configured successfully.");
} else {
    console.warn(
        "GEMINI_API_KEY is missing. AI analysis will not work."
    );
}

// Home route
app.get("/", (req, res) => {
    res.send("Welcome to DevFlow AI Backend!");
});

// --------------------------------------------------
// 1. GET ALL BUGS
// --------------------------------------------------

app.get("/api/bugs", async (req, res) => {
    try {
        const bugs = await prisma.bug.findMany({
            orderBy: {
                createdAt: "desc",
            },
        });

        res.status(200).json(bugs);
    } catch (error) {
        console.error("Error fetching bugs:", error);

        res.status(500).json({
            error: "Failed to fetch bugs.",
        });
    }
});

// --------------------------------------------------
// CREATE NEW BUG / ISSUE
app.post("/api/bugs", async (req, res) => {
    try {
        const {
            title,
            description,
            priority,
            severity,
            githubUrl,
        } = req.body;

        // Validate required fields
        if (
            typeof title !== "string" ||
            !title.trim() ||
            typeof description !== "string" ||
            !description.trim()
        ) {
            return res.status(400).json({
                error: "Title and description are required.",
            });
        }

        // Validate priority
        const allowedPriorities = [
            "Low",
            "Medium",
            "High",
            "Critical",
        ];

        if (!allowedPriorities.includes(priority)) {
            return res.status(400).json({
                error: "Invalid priority.",
            });
        }

        // Validate severity
        const allowedSeverities = [
            "Low",
            "Medium",
            "High",
            "Critical",
        ];

        if (!allowedSeverities.includes(severity)) {
            return res.status(400).json({
                error: "Invalid severity.",
            });
        }

        // Validate GitHub repository URL if provided
        if (!validateGithubUrl(githubUrl)) {
            return res.status(400).json({
                error: "Enter a valid HTTPS GitHub repository URL.",
            });
        }

        // Save the issue to the database
        const bug = await prisma.bug.create({
            data: {
                title: title.trim(),
                description: description.trim(),
                priority,
                severity,
                githubUrl: githubUrl?.trim() || null,
            },
        });

        // Return the newly created issue
        return res.status(201).json(bug);

    } catch (error) {
        console.error("Error creating bug:", error);

        return res.status(500).json({
            error: "Failed to create bug.",
            details: error.message,
        });
    }
});

// --------------------------------------------------
// 3. UPDATE BUG STATUS
// --------------------------------------------------

app.patch("/api/bugs/:id/status", async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { status } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                error: "Invalid bug ID.",
            });
        }

        const allowedStatuses = [
            "Open",
            "In Progress",
            "Closed",
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                error:
                    "Invalid status. Use Open, In Progress, or Closed.",
            });
        }

        const existingBug = await prisma.bug.findUnique({
            where: {
                id: id,
            },
        });

        if (!existingBug) {
            return res.status(404).json({
                error: "Bug not found.",
            });
        }

        const updatedBug = await prisma.bug.update({
            where: {
                id: id,
            },
            data: {
                status: status,
            },
        });

        res.status(200).json(updatedBug);
    } catch (error) {
        console.error("Error updating bug status:", error);

        res.status(500).json({
            error: "Failed to update bug status.",
        });
    }
});
// Update bug details
app.put("/api/bugs/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);

        const {
    title,
    description,
    priority,
    severity,
    githubUrl
} = req.body;

        // Validate issue ID
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                error: "Invalid bug ID"
            });
        }

        // Validate required fields
        if (
            typeof title !== "string" ||
            !title.trim() ||
            typeof description !== "string" ||
            !description.trim()
        ) {
            return res.status(400).json({
                error: "Title and description are required"
            });
        }

        // Validate priority
        const allowedPriorities = [
            "Low",
            "Medium",
            "High",
            "Critical"
        ];

        if (!allowedPriorities.includes(priority)) {
            return res.status(400).json({
                error: "Invalid priority"
            });
        }

        // Validate severity
        const allowedSeverities = [
            "Low",
            "Medium",
            "High",
            "Critical"
        ];

        if (!allowedSeverities.includes(severity)) {
            return res.status(400).json({
                error: "Invalid severity"
            });
        }

        // Update the issue in PostgreSQL through Prisma
       const updatedBug = await prisma.bug.update({
    where: { id },
    data: {
        title: title.trim(),
        description: description.trim(),
        priority,
        severity,
        githubUrl: githubUrl?.trim() || null
    }
});

        res.json({
            message: "Bug updated successfully",
            bug: updatedBug
        });

    } catch (error) {
        console.error("Error updating bug:", error);

        if (error.code === "P2025") {
            return res.status(404).json({
                error: "Bug not found"
            });
        }

        res.status(500).json({
            error: "Failed to update bug"
        });
    }
});
// Check for possible duplicate issues
app.post("/api/bugs/check-duplicates", async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        error: "Title and description are required.",
      });
    }

    // Retrieve existing issues from the database
    const existingBugs = await prisma.bug.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        severity: true,
        status: true,
      },
    });

    // Normalize text before comparing it
    function normalizeText(text) {
      return String(text || "")
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Calculate Jaccard similarity between two texts
    function calculateSimilarity(text1, text2) {
      const words1 = new Set(normalizeText(text1).split(" ").filter(Boolean));
      const words2 = new Set(normalizeText(text2).split(" ").filter(Boolean));

      if (words1.size === 0 || words2.size === 0) {
        return 0;
      }

      const intersection = [...words1].filter((word) =>
        words2.has(word)
      ).length;

      const union = new Set([...words1, ...words2]).size;

      return intersection / union;
    }

    const newIssueText = `${title} ${description}`;

    const duplicates = existingBugs
      .map((bug) => {
        const existingIssueText = `${bug.title} ${bug.description}`;

        const similarity = calculateSimilarity(
          newIssueText,
          existingIssueText
        );

        return {
          ...bug,
          similarity: Math.round(similarity * 100),
        };
      })
      .filter((bug) => bug.similarity >= 35)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    return res.json({
      duplicates,
      hasDuplicates: duplicates.length > 0,
    });
  } catch (error) {
    console.error("Duplicate detection error:", error);

    return res.status(500).json({
      error: "Unable to check for duplicate issues.",
    });
  }
});

// --------------------------------------------------
// 4. AI-POWERED BUG ANALYSIS
// --------------------------------------------------

app.post("/api/bugs/:id/analyze", async (req, res) => {
    try {
        // Check Gemini configuration
        if (!ai) {
            return res.status(503).json({
                error:
                    "Gemini AI is not configured. Check the GEMINI_API_KEY in your server .env file.",
            });
        }

        // Validate bug ID
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                error: "Invalid bug ID.",
            });
        }

        // Find the selected bug
        const bug = await prisma.bug.findUnique({
            where: {
                id: id,
            },
        });

        if (!bug) {
            return res.status(404).json({
                error: "Bug not found.",
            });
        }

        // Prompt sent to Gemini AI
        const prompt = `
You are an experienced software engineer and AI debugging assistant
for DevFlow AI, a bug tracking and developer collaboration platform.

Analyze the following software bug and provide a practical,
developer-friendly response.

BUG DETAILS
-----------
Bug ID: ${bug.id}
Title: ${bug.title}
Description: ${bug.description}
Priority: ${bug.priority}
Severity: ${bug.severity}
Status: ${bug.status}

Provide your response using the following sections.

## 1. Bug Summary

Explain the problem in simple language.
Describe what might be going wrong based on the provided details.

## 2. Possible Root Causes

List the most likely causes of the problem.

Explain why each cause might be relevant.
Clearly state when the information provided is insufficient
to determine the exact cause.

## 3. Debugging Steps

Give clear, numbered steps a developer can follow
to investigate the issue.

Include relevant logs, debugging tools, or checks where appropriate.

## 4. Recommended Fix

Recommend a practical solution based on the available information.

Explain why the solution may resolve the problem.

If the available information is insufficient to identify an exact fix,
explain what additional information is needed.

## 5. Example Code

Provide a relevant code example when possible.

Use Markdown fenced code blocks with the appropriate programming
language, such as javascript, python, java, sql, or php.

Explain:
- What the code does.
- Why it may help.
- Where the developer might need to apply it.

If the programming language, framework, or existing implementation
is unknown, clearly label the code as an illustrative example.

Do not invent existing application files, functions, or source code.
Do not present hypothetical code as if it came from the user's project.

## 6. Testing the Fix

Provide practical test cases to verify the proposed solution.

Include expected results where possible.

Mention relevant edge cases and possible regression tests.

Do not claim that you have executed these tests.

## 7. Severity and Priority Recommendation

Review the current severity and priority.

Recommend changes only when justified by the available information.

Explain your reasoning.

## 8. Additional Information Needed

List any missing information that would help diagnose the issue.

Examples include:
- Error messages and stack traces.
- Relevant source code.
- Steps to reproduce the issue.
- Programming language and framework.
- Operating system and environment details.
- Expected versus actual behavior.

IMPORTANT RULES
---------------
- Be specific, clear, and actionable.
- Do not claim that you executed code or verified a fix.
- Do not guarantee that a suggested solution will work.
- Do not invent error messages, logs, or project details.
- Clearly distinguish confirmed information from assumptions.
- If the bug description is too vague, explain what is missing.
- Use Markdown headings, numbered lists, bullet points,
  and code blocks to make the response easy to read.
`;

        // Generate analysis using Gemini
        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: prompt,
        });

        const analysis = response.text;

        if (!analysis || !analysis.trim()) {
            return res.status(502).json({
                error:
                    "Gemini returned an empty analysis. Please try again.",
            });
        }

        // Send the analysis to the frontend
        res.status(200).json({
            bugId: bug.id,
            bugTitle: bug.title,
            analysis: analysis,
        });
    } catch (error) {
        console.error("AI bug analysis error:", error);

        // Handle common API errors
        const errorMessage =
            error && error.message
                ? error.message
                : "Unknown error";

        if (
            errorMessage.includes("429") ||
            errorMessage.toLowerCase().includes("quota") ||
            errorMessage.toLowerCase().includes("rate limit")
        ) {
            return res.status(429).json({
                error:
                    "Gemini API rate limit or quota reached. Please wait and try again.",
            });
        }

        if (
            errorMessage.includes("503") ||
            errorMessage.toLowerCase().includes("overloaded") ||
            errorMessage.toLowerCase().includes("unavailable")
        ) {
            return res.status(503).json({
                error:
                    "Gemini AI is temporarily unavailable or busy. Please try again shortly.",
            });
        }

        res.status(500).json({
            error:
                "AI analysis failed. Check the server terminal for details.",
        });
    }
});

// --------------------------------------------------
// 5. DELETE A BUG
// --------------------------------------------------

app.delete("/api/bugs/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                error: "Invalid bug ID.",
            });
        }

        const existingBug = await prisma.bug.findUnique({
            where: {
                id: id,
            },
        });

        if (!existingBug) {
            return res.status(404).json({
                error: "Bug not found.",
            });
        }

        await prisma.bug.delete({
            where: {
                id: id,
            },
        });

        res.status(200).json({
            message: "Bug deleted successfully.",
            id: id,
        });
    } catch (error) {
        console.error("Error deleting bug:", error);

        res.status(500).json({
            error: "Failed to delete bug.",
        });
    }
});
// Smart Bug Priority Recommendation
app.post("/api/bugs/recommend-priority", async (req, res) => {
    try {
        const { title, description } = req.body;

        if (!title || !description) {
            return res.status(400).json({
                error: "Title and description are required."
            });
        }

        const text = `${title} ${description}`.toLowerCase();

        let priority = "Medium";
        let reason = "The issue may affect functionality but needs further investigation.";

        const criticalKeywords = [
            "data loss",
            "security breach",
            "payment failure",
            "all users",
            "complete outage",
            "system down",
            "database down"
        ];

        const highKeywords = [
            "crash",
            "cannot login",
            "can't login",
            "unable to login",
            "login failure",
            "not working",
            "unavailable",
            "blocked",
            "failure",
            "fails",
            "error"
        ];

        const lowKeywords = [
            "typo",
            "spelling",
            "font",
            "color",
            "alignment",
            "cosmetic",
            "minor ui"
        ];

        if (criticalKeywords.some(keyword => text.includes(keyword))) {
            priority = "High";
            reason = "The issue may affect data security, payments, or overall system availability.";
        } else if (highKeywords.some(keyword => text.includes(keyword))) {
            priority = "High";
            reason = "The issue may prevent users from completing an important operation.";
        } else if (lowKeywords.some(keyword => text.includes(keyword))) {
            priority = "Low";
            reason = "The issue appears cosmetic and may not prevent core functionality.";
        }

        res.json({
            priority,
            reason,
            method: "Rule-based recommendation"
        });

    } catch (error) {
        console.error("Priority recommendation error:", error);

        res.status(500).json({
            error: "Unable to recommend bug priority."
        });
    }
});
// AI-Powered Bug Severity Recommendation
app.post("/api/bugs/recommend-severity", async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        error: "Title and description are required."
      });
    }

    const text = `${title} ${description}`.toLowerCase();

    let severity = "Medium";
    let reason =
      "The issue affects functionality and needs further investigation.";

    const criticalKeywords = [
      "complete outage",
      "system down",
      "application down",
      "database down",
      "data loss",
      "security breach",
      "all users affected"
    ];

    const highKeywords = [
      "crash",
      "cannot login",
      "can't login",
      "unable to login",
      "payment failure",
      "application freezes",
      "feature unavailable",
      "login failure"
    ];

    const lowKeywords = [
      "typo",
      "spelling",
      "font",
      "color",
      "alignment",
      "cosmetic",
      "minor ui"
    ];

    if (criticalKeywords.some(keyword => text.includes(keyword))) {
      severity = "Critical";
      reason =
        "The issue may cause a major outage, data loss, or a serious security problem.";
    } else if (highKeywords.some(keyword => text.includes(keyword))) {
      severity = "High";
      reason =
        "The issue may prevent users from completing an important operation.";
    } else if (lowKeywords.some(keyword => text.includes(keyword))) {
      severity = "Low";
      reason =
        "The issue appears cosmetic and may not affect core functionality.";
    }

    res.json({
      severity,
      reason,
      method: "Rule-based recommendation"
    });

  } catch (error) {
    console.error("Severity recommendation error:", error);

    res.status(500).json({
      error: "Unable to recommend bug severity."
    });
  }
});
// --------------------------------------------------
// 6. START SERVER
// --------------------------------------------------

const server = app.listen(PORT, () => {
    console.log("----------------------------------");
    console.log("DevFlow AI Backend Started");
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(
        `Gemini AI: ${ai ? "Configured" : "Not configured"}`
    );
    console.log("----------------------------------");
});

// Handle unexpected server errors
server.on("error", (error) => {
    console.error("Server error:", error);
});

// Gracefully close database connections
async function shutdown() {
    console.log("Shutting down DevFlow AI server...");

    server.close(async () => {
        try {
            await prisma.$disconnect();
            console.log("Database connection closed.");
            process.exit(0);
        } catch (error) {
            console.error(
                "Error closing database connection:",
                error
            );
            process.exit(1);
        }
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);