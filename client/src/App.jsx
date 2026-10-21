import { useEffect, useState } from "react";
import "./App.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false);

  const codeText =
    typeof children === "string"
      ? children
      : Array.isArray(children)
        ? children.join("")
        : String(children ?? "");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);

      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Could not copy code:", error);
      alert("Unable to copy code. Please select and copy it manually.");
    }
  }

  return (
    <div className="ai-code-block">
      <div className="ai-code-toolbar">
        <span>CODE EXAMPLE</span>

        <button
          type="button"
          className="ai-copy-button"
          onClick={copyCode}
        >
          {copied ? "✓ Copied" : "Copy Code"}
        </button>
      </div>

      <pre>
        {children}
      </pre>
    </div>
  );
}

const API = "http://localhost:5000/api/bugs";

const initialForm = {
  title: "",
  description: "",
  priority: "Medium",
  severity: "Medium",
  githubUrl: "",
};

function App() {
  const [bugs, setBugs] = useState([]);
  const [activePage, setActivePage] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [editingBugId, setEditingBugId] = useState(null);
  const [editForm, setEditForm] = useState(initialForm);
  const [updatingBug, setUpdatingBug] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedBugId, setSelectedBugId] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [aiError, setAiError] = useState("");
  
  const [recommendingPriority, setRecommendingPriority] = useState(false);
  const [priorityRecommendation, setPriorityRecommendation] = useState(null);
  const [priorityError, setPriorityError] = useState("");
  const [recommendingSeverity, setRecommendingSeverity] = useState(false);
  const [severityRecommendation, setSeverityRecommendation] = useState(null);
  const [severityError, setSeverityError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateIssues, setDuplicateIssues] = useState([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [pendingIssue, setPendingIssue] = useState(null);
 

  async function loadBugs() {
    try {
      setError("");

      const response = await fetch(API);

      if (!response.ok) {
        throw new Error("Could not retrieve issues.");
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("Unexpected response from the server.");
      }

      setBugs(data);
    } catch (err) {
      console.error(err);
      setError(
        "Unable to load issues. Check that the backend and database are running."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBugs();
  }, []);

  useEffect(() => {
    if (!notice) return;

    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const openCount = bugs.filter((bug) => bug.status === "Open").length;

  const progressCount = bugs.filter(
    (bug) => bug.status === "In Progress"
  ).length;

  const closedCount = bugs.filter(
    (bug) => bug.status === "Closed" || bug.status === "Resolved"
  ).length;

  const criticalCount = bugs.filter(
    (bug) =>
      bug.priority?.toLowerCase() === "critical" ||
      bug.severity?.toLowerCase() === "critical"
  ).length;

  const filteredBugs = bugs.filter((bug) => {
    const query = search.toLowerCase();

    return [
      bug.title,
      bug.description,
      bug.status,
      bug.priority,
      String(bug.id),
    ].some((value) => String(value ?? "").toLowerCase().includes(query));
  });
  async function checkDuplicates(event) {
  event.preventDefault();

  if (!form.title.trim() || !form.description.trim()) {
    setError("Please enter both the title and description.");
    return;
  }

  try {
    setCheckingDuplicates(true);
    setError("");
    setDuplicateIssues([]);

    const response = await fetch(`${API}/check-duplicates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Duplicate checking failed.");
    }

    if (data.hasDuplicates) {
      setDuplicateIssues(data.duplicates);
      setPendingIssue({ ...form });
      setShowDuplicateWarning(true);
    } else {
      await createIssue(event);
    }
  } catch (err) {
    console.error(err);
    setError(
      "Could not check for duplicates. Please check the backend connection."
    );
  } finally {
    setCheckingDuplicates(false);
  }
}
async function recommendSeverity() {
  if (!form.title.trim() || !form.description.trim()) {
    setSeverityError("Enter both title and description first.");
    setSeverityRecommendation(null);
    return;
  }

  setRecommendingSeverity(true);
  setSeverityError("");
  setSeverityRecommendation(null);

  try {
    const response = await fetch(`${API}/recommend-severity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: form.title,
        description: form.description
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Unable to recommend severity."
      );
    }

    setSeverityRecommendation(data);

  } catch (err) {
    setSeverityError(
      err.message || "Could not connect to the backend."
    );
  } finally {
    setRecommendingSeverity(false);
  }
}
async function createIssueAnyway() {
  if (!pendingIssue || saving) {
    return;
  }

  const controller = new AbortController();

  // Stop waiting if the backend does not respond within 15 seconds.
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    setSaving(true);
    setError("");

    console.log("Creating issue:", pendingIssue);

    const response = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...pendingIssue,
        githubUrl: pendingIssue.githubUrl?.trim() || null,
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    console.log("Create issue response:", response.status, data);

    if (!response.ok) {
      throw new Error(
        data.error ||
          `Could not create issue. HTTP ${response.status}`
      );
    }

    // Reset the form after successful creation.
    setForm(initialForm);
    setShowForm(false);
    setShowDuplicateWarning(false);
    setDuplicateIssues([]);
    setPendingIssue(null);

    await loadBugs();

    setActivePage("All Issues");
    setNotice("Issue created successfully.");
  } catch (err) {
    console.error("Create issue error:", err);

    if (err.name === "AbortError") {
      setError(
        "The backend did not respond within 15 seconds. Check the server terminal and database connection."
      );
    } else if (err instanceof TypeError) {
      setError(
        "Cannot connect to the backend. Check that the server is running at http://localhost:5000."
      );
    } else {
      setError(err.message || "Could not create the issue.");
    }
  } finally {
    clearTimeout(timeoutId);
    setSaving(false);
  }
}
async function recommendPriority() {
  if (!form.title.trim() || !form.description.trim()) {
    setPriorityError("Enter both title and description first.");
    setPriorityRecommendation(null);
    return;
  }

  setRecommendingPriority(true);
  setPriorityError("");
  setPriorityRecommendation(null);

  try {
    const response = await fetch(
      `${API}/recommend-priority`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to recommend priority.");
    }

    setPriorityRecommendation(data);
  } catch (err) {
    setPriorityError(err.message || "Could not connect to the backend.");
  } finally {
    setRecommendingPriority(false);
  }
}


  async function createIssue(event) {
    event.preventDefault();

    // Prevent duplicate submissions while a request is in progress.
    if (saving) return;

    try {
      setSaving(true);
      setError("");

      // Send an empty optional GitHub URL as null, not an empty string.
      const issuePayload = {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        githubUrl: form.githubUrl?.trim() || null,
      };

      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(issuePayload),
      });

      // Read the backend response so its actual validation/database error
      // can be shown instead of hiding it behind a generic message.
      const data = await response.json().catch(() => ({}));
      console.log("Create issue response:", response.status, data);

      if (!response.ok) {
        throw new Error(
          data.error || data.message || `Unable to create the issue (HTTP ${response.status}).`
        );
      }

      setForm(initialForm);
      setShowForm(false);
      await loadBugs();
      setActivePage("All Issues");
      setNotice("Issue created successfully.");
    } catch (err) {
      console.error("Create issue error:", err);
      setError(
        err instanceof TypeError
          ? "Cannot connect to the backend. Check that the server is running at http://localhost:5000."
          : err.message || "Could not create the issue. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }
  function startEditing(bug) {
  setEditingBugId(bug.id);

  setEditForm({
  title: bug.title || "",
  description: bug.description || "",
  priority: bug.priority || "Medium",
  severity: bug.severity || "Medium",
  githubUrl: bug.githubUrl || "",
});

  setShowForm(false);
  setError("");
  setActivePage("All Issues");

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

async function saveEditedIssue(event) {
  event.preventDefault();

  if (!editingBugId) {
    setError("Please select an issue to edit.");
    return;
  }

  try {
    setUpdatingBug(true);
    setError("");

    const response = await fetch(`${API}/${editingBugId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...editForm,
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        githubUrl: editForm.githubUrl?.trim() || null,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Could not update the issue."
      );
    }

    setEditingBugId(null);
    setEditForm(initialForm);

    await loadBugs();

    setNotice(
      `BUG-${editingBugId} updated successfully.`
    );
  } catch (err) {
    console.error("Update issue error:", err);

    setError(
      err.message || "Could not update the issue."
    );
  } finally {
    setUpdatingBug(false);
  }
}

function cancelEditing() {
  setEditingBugId(null);
  setEditForm(initialForm);
  setError("");
}

  async function updateStatus(id, status) {
    try {
      setError("");

      const response = await fetch(`${API}/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("Unable to update status.");
      }

      await loadBugs();
      setNotice("Issue status updated.");
    } catch (err) {
      console.error(err);
      setError("Could not update the issue status.");
    }
  }

 async function analyzeBug(event) {
  event?.preventDefault?.();

  if (!selectedBugId) {
    setAiError("Please select a bug to analyze.");
    return;
  }

  try {
    setAnalyzing(true);
    setAiError("");
    setAnalysis("");
    setCopyMessage("");

    const response = await fetch(
      `${API}/${selectedBugId}/analyze`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "AI analysis failed. Please try again."
      );
    }

    setAnalysis(
      data.analysis || "The AI returned no analysis."
    );

    setNotice(
      `AI analysis completed for BUG-${data.bugId}.`
    );
  } catch (err) {
    console.error("AI analysis error:", err);

    setAiError(
      err.message ||
        "Could not analyze this bug. Check that the backend is running."
    );
  } finally {
    setAnalyzing(false);
  }
}
// Copy the complete AI analysis
async function copyAnalysis() {
  if (!analysis) return;

  try {
    await navigator.clipboard.writeText(analysis);

    setCopyMessage("Analysis copied successfully!");

    setTimeout(() => setCopyMessage(""), 2500);
  } catch (error) {
    console.error("Could not copy analysis:", error);

    setCopyMessage(
      "Unable to copy. Please select and copy the text manually."
    );

    setTimeout(() => setCopyMessage(""), 3500);
  }
}

// Extract the recommended fix section from Gemini's response
function getSuggestedFix(text) {
  if (!text) return "";

  const match = text.match(
    /^#{1,4}\s*(?:\d+[\.\)]\s*)?(?:\*\*)?(?:Recommended Fix|Suggested Fix|Proposed Fix|Fix Recommendation)(?:\*\*)?.*$/im
  );

  if (!match || match.index === undefined) {
    return "";
  }

  const remainingText = text.slice(
    match.index + match[0].length
  );

  const nextSection = remainingText.search(
    /^#{1,4}\s+/m
  );

  const section =
    nextSection === -1
      ? remainingText
      : remainingText.slice(0, nextSection);

  return section.trim();
}

// Copy the suggested fix
async function copySuggestedFix() {
  const fix = getSuggestedFix(analysis);

  if (!fix) {
    setCopyMessage(
      "No separate Recommended Fix section was found in this analysis."
    );

    setTimeout(() => setCopyMessage(""), 3000);
    return;
  }

  try {
    await navigator.clipboard.writeText(fix);

    setCopyMessage("Suggested fix copied successfully!");

    setTimeout(() => setCopyMessage(""), 2500);
  } catch (error) {
    console.error("Could not copy suggested fix:", error);

    setCopyMessage(
      "Unable to copy the suggested fix."
    );

    setTimeout(() => setCopyMessage(""), 3000);
  }
}

// Scroll directly to the recommended fix section
function jumpToSuggestedFix() {
  const fixSection = document.getElementById(
    "suggested-fix-section"
  );

  if (fixSection) {
    fixSection.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

  async function deleteIssue(id) {
    if (!window.confirm("Are you sure you want to delete this issue?")) {
      return;
    }

    try {
      setError("");

      const response = await fetch(`${API}/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Unable to delete the issue.");
      }

      await loadBugs();
      setNotice("Issue deleted successfully.");
    } catch (err) {
      console.error(err);
      setError("Could not delete the issue.");
    }
  }

  const navigation = [
    { label: "Dashboard", icon: "◫" },
    { label: "All Issues", icon: "◈" },
    { label: "AI Assistant", icon: "✳" },
    { label: "Projects", icon: "▦" },
    { label: "Team", icon: "♧" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <h2>DevFlow<span> AI</span></h2>
            <p>Developer workspace</p>
          </div>
        </div>

        <div className="workspace-card">
          <div className="workspace-avatar">D</div>
          <div>
            <strong>DevFlow Team</strong>
            <span>My workspace</span>
          </div>
          <span className="workspace-arrow">⌄</span>
        </div>

        <p className="sidebar-heading">WORKSPACE</p>

        <nav className="nav-list">
          {navigation.map((item) => (
            <button
              key={item.label}
              className={`nav-link ${
                activePage === item.label ? "selected" : ""
              }`}
              onClick={() => setActivePage(item.label)}
            >
              <span className="nav-symbol">{item.icon}</span>
              <span>{item.label}</span>

              {item.label === "All Issues" && (
                <span className="nav-counter">{bugs.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-ai-card">
          <div className="ai-sparkle">✳</div>
          <h3>Meet your AI assistant</h3>
          <p>
            Get help investigating bugs and exploring possible solutions.
          </p>
          <button onClick={() => setActivePage("AI Assistant")}>
            Explore AI <span>→</span>
          </button>
        </div>

        <div className="sidebar-profile">
          <div className="profile-avatar">A</div>
          <div>
            <strong>Admin User</strong>
            <span>Workspace administrator</span>
          </div>
          <span className="profile-menu">•••</span>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <strong>{activePage}</strong>
          </div>

          <div className="topbar-right">
            <label className="search-field">
              <span>⌕</span>
              <input
                type="search"
                placeholder="Search issues..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search issues"
              />
              <kbd>⌘ K</kbd>
            </label>
            <div className="top-avatar">A</div>
          </div>
        </header>

        <div className="content-area">
          {notice && (
            <div className="toast-success" role="status">
              <span>✓</span> {notice}
            </div>
          )}

          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={loadBugs}>Retry</button>
            </div>
          )}

          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="live-dot" /> YOUR DEVELOPER WORKSPACE
              </div>
              <h1>
                {activePage === "Dashboard"
                  ? "Good to see you"
                  : activePage}
                <span className="heading-sparkle"> ✦</span>
              </h1>
              <p>
                Here's an overview of your issues and development activity.
              </p>
            </div>

            <button
              className="primary-button"
              onClick={() => {
                setForm(initialForm);
                setShowForm((previous) => !previous);
              }}
            >
              <span>＋</span> Create Issue
            </button>
          </section>

          {showForm && (
            <section className="panel form-panel">
              <div className="section-heading">
                <div>
                  <h2>Create a new issue</h2>
                  <p>Describe the problem you discovered.</p>
                </div>
                <button
                  className="close-button"
                  onClick={() => setShowForm(false)}
                  aria-label="Close form"
                >
                  ×
                </button>
              </div>

              <form onSubmit={checkDuplicates}>
                <div className="form-field">
                  <label htmlFor="title">Issue title</label>
                  <input
                    id="title"
                    name="title"
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                    placeholder="e.g. Login button is not working"
                    maxLength={200}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    name="description"
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    placeholder="Explain what happened and how to reproduce it..."
                    rows={4}
                    required
                  />
                </div>
                <div className="form-field">
  <label htmlFor="githubUrl">
    GitHub Repository URL (Optional)
  </label>

  <input
    id="githubUrl"
    type="url"
    value={form.githubUrl}
    onChange={(event) =>
      setForm({
        ...form,
        githubUrl: event.target.value,
      })
    }
    placeholder="https://github.com/username/repository"
  />
</div>
                {/* Smart Priority Recommendation */}
<div className="priority-recommendation">
  <button
    type="button"
    className="recommend-priority-btn"
    onClick={recommendPriority}
    disabled={recommendingPriority}
  >
    {recommendingPriority
      ? "Analyzing..."
      : "✨ Recommend Priority"}
  </button>

  {priorityError && (
    <p className="priority-error">{priorityError}</p>
  )}

  {priorityRecommendation && (
    <div className="priority-result">
      <h4>Priority Recommendation</h4>

      <p>
        <strong>Suggested Priority:</strong>{" "}
        <span
          className={`priority-badge ${priorityRecommendation.priority.toLowerCase()}`}
        >
          {priorityRecommendation.priority}
        </span>
      </p>

      <p>
        <strong>Reason:</strong> {priorityRecommendation.reason}
      </p>

      <button
        type="button"
        onClick={() => {
          setForm((previous) => ({
            ...previous,
            priority: priorityRecommendation.priority,
          }));
        }}
      >
        Apply Recommended Priority
      </button>
    </div>
  )}
</div>
{/* Smart Severity Recommendation */}
<div className="severity-recommendation">
  <button
    type="button"
    className="recommend-severity-btn"
    onClick={recommendSeverity}
    disabled={recommendingSeverity}
  >
    {recommendingSeverity
      ? "Analyzing..."
      : "✨ Recommend Severity"}
  </button>

  {severityError && (
    <p className="severity-error">{severityError}</p>
  )}

  {severityRecommendation && (
    <div className="severity-result">
      <h4>Severity Recommendation</h4>

      <p>
        <strong>Suggested Severity:</strong>{" "}
        <span
          className={`severity-label ${severityRecommendation.severity.toLowerCase()}`}
        >
          {severityRecommendation.severity}
        </span>
      </p>

      <p>
        <strong>Reason:</strong>{" "}
        {severityRecommendation.reason}
      </p>

      <button
        type="button"
        onClick={() => {
          setForm(previous => ({
            ...previous,
            severity: severityRecommendation.severity
          }));
        }}
      >
        Apply Recommended Severity
      </button>
    </div>
  )}
</div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="priority">Priority</label>
                    <select
                      id="priority"
                      value={form.priority}
                      onChange={(event) =>
                        setForm({ ...form, priority: event.target.value })
                      }
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Critical</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label htmlFor="severity">Severity</label>
                    <select
                      id="severity"
                      value={form.severity}
                      onChange={(event) =>
                        setForm({ ...form, severity: event.target.value })
                      }
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Critical</option>
                    </select>
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Submit Issue →"}
                  </button>
                </div>
              </form>
            </section>
          )}
          {editingBugId !== null && (
  <section className="panel form-panel edit-form-panel">
    <div className="section-heading">
      <div>
        <h2>Edit Issue BUG-{editingBugId}</h2>
        <p>
          Update the issue details and save your changes.
        </p>
      </div>

      <button
        type="button"
        className="close-button"
        onClick={cancelEditing}
        aria-label="Cancel editing"
      >
        ×
      </button>
    </div>

    <form onSubmit={saveEditedIssue}>
      <div className="form-field">
        <label htmlFor="edit-title">
          Issue title
        </label>

        <input
          id="edit-title"
          value={editForm.title}
          onChange={(event) =>
            setEditForm({
              ...editForm,
              title: event.target.value,
            })
          }
          maxLength={200}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="edit-description">
          Description
        </label>

        <textarea
          id="edit-description"
          value={editForm.description}
          onChange={(event) =>
            setEditForm({
              ...editForm,
              description: event.target.value,
            })
          }
          rows={4}
          required
        />
      </div>

<div className="form-field">
  <label htmlFor="edit-githubUrl">
    GitHub Repository URL (Optional)
  </label>

  <input
    id="edit-githubUrl"
    type="url"
    value={editForm.githubUrl || ""}
    onChange={(event) =>
      setEditForm({
        ...editForm,
        githubUrl: event.target.value,
      })
    }
    placeholder="https://github.com/username/repository"
  />
</div>
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="edit-priority">
            Priority
          </label>

          <select
            id="edit-priority"
            value={editForm.priority}
            onChange={(event) =>
              setEditForm({
                ...editForm,
                priority: event.target.value,
              })
            }
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="edit-severity">
            Severity
          </label>

          <select
            id="edit-severity"
            value={editForm.severity}
            onChange={(event) =>
              setEditForm({
                ...editForm,
                severity: event.target.value,
              })
            }
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={cancelEditing}
          disabled={updatingBug}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="primary-button"
          disabled={updatingBug}
        >
          {updatingBug
            ? "Saving Changes..."
            : "Save Changes →"}
        </button>
      </div>
    </form>
  </section>
)}


          {activePage === "AI Assistant" ? (
            <section className="panel assistant-panel">
              <div className="assistant-icon">✳</div>
              <p className="eyebrow">DEVFLOW INTELLIGENCE · GEMINI</p>
              <h2>Your AI debugging assistant</h2>
              <p className="assistant-description">
                Select an issue and ask Gemini to explain possible causes,
                suggest debugging steps, and recommend a possible fix.
              </p>

              <form onSubmit={analyzeBug} style={{ marginTop: 24, textAlign: "left" }}>
                <div className="form-field">
                  <label htmlFor="ai-bug-select">Choose an issue to analyze</label>
                  <select
                    id="ai-bug-select"
                    value={selectedBugId}
                    onChange={(event) => {
                      setSelectedBugId(event.target.value);
                      setAnalysis("");
                      setAiError("");
                    }}
                    required
                    style={{ width: "100%" }}
                  >
                    <option value="">Select a bug...</option>
                    {bugs.map((bug) => (
                      <option key={bug.id} value={bug.id}>
                        BUG-{bug.id} — {bug.title}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={analyzing || bugs.length === 0}
                >
                  {analyzing
                    ? "Analyzing with Gemini..."
                    : "✳ Analyze with AI"}
                </button>
              </form>

              {aiError && (
                <div className="error-banner" role="alert" style={{ marginTop: 18 }}>
                  {aiError}
                </div>
              )}

              {analyzing && (
                <p role="status" style={{ marginTop: 18 }}>
                  Gemini is analyzing the selected bug. This may take a few seconds...
                </p>
              )}

              {analysis && (
  <section
    className="panel ai-analysis-panel"
    aria-live="polite"
  >
    {/* Analysis header */}
    <div className="ai-analysis-header">
      <div>
        <span className="ai-analysis-label">
          ✳ GEMINI AI REPORT
        </span>

        <h2>AI Bug Analysis</h2>

        <p className="ai-analysis-subtitle">
          {bugs.find(
            (bug) =>
              String(bug.id) === String(selectedBugId)
          )?.title || "Selected issue"}
        </p>
      </div>

      <span className="panel-tag">
        AI GENERATED
      </span>
    </div>

    {/* Action buttons */}
    <div className="ai-action-toolbar">
      <button
        type="button"
        className="ai-secondary-button"
        onClick={copyAnalysis}
      >
        ▣ Copy Analysis
      </button>

      <button
        type="button"
        className="ai-secondary-button"
        onClick={jumpToSuggestedFix}
      >
        ✦ View Suggested Fix
      </button>

      <button
        type="button"
        className="ai-primary-button"
        onClick={() => analyzeBug()}
        disabled={analyzing}
      >
        {analyzing
          ? "Analyzing..."
          : "↻ Retry Analysis"}
      </button>
    </div>

    {/* Copy confirmation */}
    {copyMessage && (
      <div
        className="ai-copy-notice"
        role="status"
      >
        {copyMessage}
      </div>
    )}

    {/* Suggested fix card */}
    {getSuggestedFix(analysis) && (
      <div
        id="suggested-fix-section"
        className="suggested-fix-card"
      >
        <div className="suggested-fix-heading">
          <span className="suggested-fix-icon">
            ✦
          </span>

          <div>
            <h3>Suggested Fix</h3>

            <p>
              Review this recommendation before
              applying it to your code.
            </p>
          </div>
        </div>

        <div className="suggested-fix-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
          >
            {getSuggestedFix(analysis)}
          </ReactMarkdown>
        </div>

        <button
          type="button"
          className="ai-secondary-button"
          onClick={copySuggestedFix}
        >
          ▣ Copy Suggested Fix
        </button>
      </div>
    )}

    {/* Complete Markdown analysis */}
    <div className="ai-analysis-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="ai-markdown-h1">
              {children}
            </h1>
          ),

          h2: ({ children }) => (
            <h2 className="ai-markdown-h2">
              {children}
            </h2>
          ),

          h3: ({ children }) => (
            <h3 className="ai-markdown-h3">
              {children}
            </h3>
          ),

          p: ({ children }) => (
            <p className="ai-markdown-paragraph">
              {children}
            </p>
          ),

          ul: ({ children }) => (
            <ul className="ai-markdown-list">
              {children}
            </ul>
          ),

          ol: ({ children }) => (
            <ol className="ai-markdown-list">
              {children}
            </ol>
          ),

          li: ({ children }) => (
            <li className="ai-markdown-list-item">
              {children}
            </li>
          ),

          blockquote: ({ children }) => (
            <blockquote className="ai-markdown-quote">
              {children}
            </blockquote>
          ),

          hr: () => (
            <hr className="ai-markdown-divider" />
          ),

          pre: ({ children }) => (
            <CodeBlock>
              {children}
            </CodeBlock>
          ),

          code: ({ children, className }) => {
            const isBlock = Boolean(
              className?.startsWith("language-")
            );

            return (
              <code
                className={
                  isBlock
                    ? `ai-code ${className}`
                    : "ai-inline-code"
                }
              >
                {children}
              </code>
            );
          },

          strong: ({ children }) => (
            <strong className="ai-markdown-strong">
              {children}
            </strong>
          ),

          table: ({ children }) => (
            <div className="ai-table-wrapper">
              <table className="ai-markdown-table">
                {children}
              </table>
            </div>
          ),
        }}
      >
        {analysis}
      </ReactMarkdown>
    </div>

    {/* Footer disclaimer */}
    <div className="ai-analysis-disclaimer">
      <span>ⓘ</span>

      <p>
        AI-generated suggestions may be incorrect or
        incomplete. Review the proposed changes and
        test them before applying them to your project.
      </p>
    </div>
  </section>
)}

              {bugs.length === 0 && !loading && (
                <p style={{ marginTop: 20 }}>Create an issue first, then return here to analyze it.</p>
              )}

              <div className="assistant-feature-grid" style={{ marginTop: 28 }}>
                <article>
                  <span>⌕</span>
                  <h3>Bug analysis</h3>
                  <p>Explore likely causes based on the issue description.</p>
                </article>
                <article>
                  <span>⧉</span>
                  <h3>Debugging steps</h3>
                  <p>Get practical steps to investigate the issue.</p>
                </article>
                <article>
                  <span>↗</span>
                  <h3>Fix suggestions</h3>
                  <p>Review possible solutions and what to check next.</p>
                </article>
              </div>
            </section>
          ) : activePage === "Projects" || activePage === "Team" ? (
            <section className="panel placeholder-panel">
              <div className="assistant-icon">
                {activePage === "Projects" ? "▦" : "♧"}
              </div>
              <h2>{activePage} management</h2>
              <p>
                This section is planned for a later stage. The current
                application focuses on bug tracking and issue management.
              </p>
              <button
                className="secondary-button"
                onClick={() => setActivePage("All Issues")}
              >
                Go to All Issues →
              </button>
            </section>
          ) : (
            <>
              <section className="stats-grid">
                <article className="stat-card">
                  <div className="stat-top">
                    <span>Total issues</span>
                    <span className="stat-icon purple">◈</span>
                  </div>
                  <h2>{bugs.length}</h2>
                  <div className="stat-caption">
                    <span className="mini-dot purple-dot" />
                    All reported issues
                  </div>
                </article>

                <article className="stat-card">
                  <div className="stat-top">
                    <span>Open issues</span>
                    <span className="stat-icon orange">◷</span>
                  </div>
                  <h2>{openCount}</h2>
                  <div className="stat-caption">
                    <span className="mini-dot orange-dot" />
                    Awaiting investigation
                  </div>
                </article>

                <article className="stat-card">
                  <div className="stat-top">
                    <span>In progress</span>
                    <span className="stat-icon blue">↗</span>
                  </div>
                  <h2>{progressCount}</h2>
                  <div className="stat-caption">
                    <span className="mini-dot blue-dot" />
                    Currently being worked on
                  </div>
                </article>

                <article className="stat-card">
                  <div className="stat-top">
                    <span>Closed issues</span>
                    <span className="stat-icon green">✓</span>
                  </div>
                  <h2>{closedCount}</h2>
                  <div className="stat-caption">
                    <span className="mini-dot green-dot" />
                    Completed issues
                  </div>
                </article>
              </section>

              <section className="overview-grid">
                <article className="panel overview-panel">
                  <div className="section-heading">
                    <div>
                      <h2>Issue overview</h2>
                      <p>Current status across all reported bugs</p>
                    </div>
                    <span className="panel-tag">LIVE DATA</span>
                  </div>

                  <div className="overview-body">
                    <div
                      className="donut"
                      style={{
                        "--open": `${bugs.length ? (openCount / bugs.length) * 100 : 0}%`,
                        "--progress": `${bugs.length ? (progressCount / bugs.length) * 100 : 0}%`,
                      }}
                    >
                      <div className="donut-center">
                        <strong>{bugs.length}</strong>
                        <span>Total issues</span>
                      </div>
                    </div>

                    <div className="legend">
                      <div>
                        <span className="legend-color open-color" />
                        <span>Open</span>
                        <strong>{openCount}</strong>
                      </div>
                      <div>
                        <span className="legend-color progress-color" />
                        <span>In Progress</span>
                        <strong>{progressCount}</strong>
                      </div>
                      <div>
                        <span className="legend-color closed-color" />
                        <span>Closed</span>
                        <strong>{closedCount}</strong>
                      </div>
                    </div>
                  </div>
                </article>

                <article className="panel insights-panel">
                  <div className="insights-title">
                    <div className="insights-symbol">✳</div>
                    <div>
                      <h2>AI insights</h2>
                      <p>Issue overview and future AI assistance</p>
                    </div>
                    <span className="beta-tag">BETA</span>
                  </div>

                  <div className="insight-row">
                    <div className="insight-symbol warning">!</div>
                    <div>
                      <strong>Critical issues</strong>
                      <p>
                        {criticalCount} critical issue
                        {criticalCount !== 1 ? "s" : ""} need attention.
                      </p>
                    </div>
                  </div>

                  <div className="insight-row">
                    <div className="insight-symbol sparkle">✳</div>
                    <div>
                      <strong>AI bug analysis</strong>
                      <p>
                        Open AI Assistant to analyze an issue with Gemini.
                      </p>
                    </div>
                  </div>

                  <button
                    className="insight-link"
                    onClick={() => setActivePage("AI Assistant")}
                  >
                    Explore AI Assistant <span>→</span>
                  </button>
                </article>
              </section>

              <section className="panel issues-panel">
                <div className="section-heading issues-header">
                  <div>
                    <h2>
                      {activePage === "All Issues"
                        ? "All issues"
                        : "Recent issues"}
                    </h2>
                    <p>
                      Manage your reported bugs and monitor their progress.
                    </p>
                  </div>

                  <button
                    className="secondary-button"
                    onClick={() =>
                      setActivePage(
                        activePage === "All Issues" ? "Dashboard" : "All Issues"
                      )
                    }
                  >
                    {activePage === "All Issues"
                      ? "Back to dashboard"
                      : "View all issues →"}
                  </button>
                </div>

                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>ISSUE</th>
                        <th>PRIORITY</th>
                        <th>SEVERITY</th>
                        <th>STATUS</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan="5" className="empty-state">
                            Loading issues...
                          </td>
                        </tr>
                      ) : (
                        <>
                          {(activePage === "Dashboard"
                            ? filteredBugs.slice(0, 5)
                            : filteredBugs
                          ).map((bug) => {
                            const priority = bug.priority || "Medium";
                            const severity = bug.severity || "Medium";
                            const status = bug.status || "Open";

                            return (
                              <tr key={bug.id}>
                                <td>
                                  <div className="issue-cell">
                                    <span className="issue-reference">
                                      BUG-{bug.id}
                                    </span>
                                    <strong>{bug.title}</strong>
                                    <p>{bug.description}</p>
                                    {bug.githubUrl && (
  <a
    href={bug.githubUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="github-link"
  >
    ↗ View on GitHub
  </a>
)}
                                  </div>
                                </td>

                                <td>
                                  <span
                                    className={`priority-badge ${priority.toLowerCase()}`}
                                  >
                                    <span>●</span> {priority}
                                  </span>
                                </td>

                                <td>
                                  <span
                                    className={`severity-badge ${severity.toLowerCase()}`}
                                  >
                                    {severity}
                                  </span>
                                </td>

                                <td>
                                  <select
                                    className={`status-select ${status.toLowerCase().replace(/\s+/g, "-")}`}
                                    value={status}
                                    aria-label={`Status for ${bug.title}`}
                                    onChange={(event) =>
                                      updateStatus(bug.id, event.target.value)
                                    }
                                  >
                                    <option value="Open">Open</option>
                                    <option value="In Progress">
                                      In Progress
                                    </option>
                                    <option value="Closed">Closed</option>
                                  </select>
                                </td>

                                <td>
                                  <div className="issue-actions">
                                <button
                                  type="button"
                                  className="edit-button"
                                  onClick={() => startEditing(bug)}
                                  aria-label={`Edit ${bug.title}`}
                                >
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  className="delete-button"
                                  onClick={() => deleteIssue(bug.id)}
                                  aria-label={`Delete ${bug.title}`}
                                >
                                  Delete
                                </button>
                              </div>
                                </td>
                              </tr>
                            );
                          })}

                          {filteredBugs.length === 0 && (
                            <tr>
                              <td colSpan="5" className="empty-state">
                                {search
                                  ? "No issues match your search."
                                  : "No issues found. Create your first issue."}
                              </td>
                            </tr>
                          )}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="table-footer">
                  <span>
                    Showing{" "}
                    {activePage === "Dashboard"
                      ? Math.min(filteredBugs.length, 5)
                      : filteredBugs.length}{" "}
                    of {bugs.length} issues
                  </span>
                  <span>DevFlow AI · Connected to PostgreSQL</span>
                </div>
              </section>
            </>
          )}

                              <footer className="page-footer">
            <span>© 2026 DevFlow AI</span>
            <span>Build better software, together. ✦</span>
          </footer>
        </div>
      </main>

      {/* Duplicate Warning Modal */}
      {showDuplicateWarning && (
        <div className="duplicate-overlay">
          <div
            className="duplicate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="duplicate-title"
          >
            <h2 id="duplicate-title">
              ⚠️ Possible Duplicate Issues
            </h2>

            <p>
              We found existing issues that may describe the same problem.
              Review them before continuing.
            </p>

            <div className="duplicate-list">
              {duplicateIssues.map((bug) => (
                <div className="duplicate-item" key={bug.id}>
                  <strong>
                    BUG-{bug.id}: {bug.title}
                  </strong>

                  <p>{bug.description}</p>

                  <div className="duplicate-meta">
                    <span>{bug.similarity}% word similarity</span>
                    <span>Status: {bug.status}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="duplicate-actions">
              <button
                type="button"
                onClick={() => {
                  setShowDuplicateWarning(false);
                  setDuplicateIssues([]);
                  setPendingIssue(null);
                }}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={createIssueAnyway}
                disabled={saving}
              >
                {saving ? "Creating..." : "Create Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;