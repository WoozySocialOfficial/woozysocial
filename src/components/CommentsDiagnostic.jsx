import { useState } from "react";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { baseURL } from "../utils/constants";

/**
 * DIAGNOSTIC TOOL - Social Media Comments
 *
 * Use this component to diagnose why comments might not be showing
 * in the Engagement page. This will test the entire data flow.
 */
export const CommentsDiagnostic = () => {
  const { activeWorkspace } = useWorkspace();
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const runDiagnostics = async () => {
    setLoading(true);
    const diagnosticResults = {
      timestamp: new Date().toISOString(),
      tests: []
    };

    try {
      // Test 1: Fetch post history
      diagnosticResults.tests.push({ name: "Fetching post history...", status: "running" });
      const historyResponse = await fetch(
        `${baseURL}/api/post-history?workspaceId=${activeWorkspace.id}`
      );
      const historyData = await historyResponse.json();

      if (!historyResponse.ok) {
        diagnosticResults.tests.push({
          name: "Post History API",
          status: "failed",
          error: historyData
        });
      } else {
        const responseData = historyData.data || historyData;
        const publishedPosts = (responseData.history || []).filter(
          post => post.status === "success"
        );

        diagnosticResults.tests.push({
          name: "Post History API",
          status: "passed",
          data: {
            totalPosts: responseData.history?.length || 0,
            publishedPosts: publishedPosts.length,
            firstPost: publishedPosts[0] || null
          }
        });

        // Test 2: Try to fetch comments for first published post
        if (publishedPosts.length > 0) {
          const firstPost = publishedPosts[0];
          diagnosticResults.tests.push({
            name: "Testing first post",
            status: "info",
            data: {
              postId: firstPost.id,
              platform: firstPost.platform || firstPost.platforms?.[0],
              status: firstPost.status,
              hasAyrPostId: !!firstPost.id,
              postPreview: (firstPost.post || "").substring(0, 100)
            }
          });

          diagnosticResults.tests.push({ name: "Fetching comments...", status: "running" });
          const commentsResponse = await fetch(
            `${baseURL}/api/comments/${firstPost.id}?workspaceId=${activeWorkspace.id}`
          );
          const commentsData = await commentsResponse.json();

          if (!commentsResponse.ok) {
            diagnosticResults.tests.push({
              name: "Comments API",
              status: "failed",
              error: {
                statusCode: commentsResponse.status,
                response: commentsData
              }
            });
          } else {
            const responseData = commentsData.data || commentsData;
            diagnosticResults.tests.push({
              name: "Comments API",
              status: "passed",
              data: {
                success: commentsData.success,
                commentCount: responseData.count || 0,
                hasComments: (responseData.comments?.length || 0) > 0,
                platform: responseData.platform,
                comments: responseData.comments || [],
                rawResponse: commentsData
              }
            });
          }
        } else {
          diagnosticResults.tests.push({
            name: "Comments Test",
            status: "skipped",
            reason: "No published posts found to test"
          });
        }
      }
    } catch (error) {
      diagnosticResults.tests.push({
        name: "Diagnostic",
        status: "error",
        error: error.message
      });
    }

    setResults(diagnosticResults);
    setLoading(false);
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Social Media Comments Diagnostic</h1>
      <p style={{ color: "#666" }}>
        This tool tests the entire comments data flow to identify any issues.
      </p>

      <button
        onClick={runDiagnostics}
        disabled={loading || !activeWorkspace}
        style={{
          padding: "12px 24px",
          fontSize: "16px",
          backgroundColor: "#0066cc",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: loading ? "wait" : "pointer",
          marginTop: "20px"
        }}
      >
        {loading ? "Running Diagnostics..." : "Run Diagnostics"}
      </button>

      {!activeWorkspace && (
        <p style={{ color: "red", marginTop: "10px" }}>
          Please select a workspace first
        </p>
      )}

      {results && (
        <div style={{ marginTop: "30px" }}>
          <h2>Diagnostic Results</h2>
          <p style={{ color: "#666", fontSize: "14px" }}>
            Run at: {new Date(results.timestamp).toLocaleString()}
          </p>

          {results.tests.map((test, index) => (
            <div
              key={index}
              style={{
                border: "1px solid #ddd",
                borderRadius: "6px",
                padding: "15px",
                marginTop: "15px",
                backgroundColor:
                  test.status === "passed"
                    ? "#e8f5e9"
                    : test.status === "failed"
                    ? "#ffebee"
                    : test.status === "error"
                    ? "#fff3e0"
                    : "#f5f5f5"
              }}
            >
              <h3 style={{ margin: "0 0 10px 0" }}>
                {test.status === "passed" && "✅ "}
                {test.status === "failed" && "❌ "}
                {test.status === "error" && "⚠️ "}
                {test.status === "info" && "ℹ️ "}
                {test.status === "skipped" && "⏭️ "}
                {test.name}
              </h3>

              {test.status === "running" && <p>In progress...</p>}

              {test.data && (
                <pre
                  style={{
                    backgroundColor: "#f5f5f5",
                    padding: "10px",
                    borderRadius: "4px",
                    overflow: "auto",
                    fontSize: "12px"
                  }}
                >
                  {JSON.stringify(test.data, null, 2)}
                </pre>
              )}

              {test.error && (
                <pre
                  style={{
                    backgroundColor: "#fff3e0",
                    padding: "10px",
                    borderRadius: "4px",
                    overflow: "auto",
                    fontSize: "12px",
                    color: "#d32f2f"
                  }}
                >
                  {JSON.stringify(test.error, null, 2)}
                </pre>
              )}

              {test.reason && (
                <p style={{ color: "#666", fontStyle: "italic" }}>{test.reason}</p>
              )}
            </div>
          ))}

          <div style={{ marginTop: "30px", padding: "15px", backgroundColor: "#e3f2fd", borderRadius: "6px" }}>
            <h3>Interpretation Guide:</h3>
            <ul>
              <li>
                <strong>Post History API passed + 0 published posts:</strong> No posts have
                been successfully published to social media yet. Publish a post first.
              </li>
              <li>
                <strong>Comments API passed + 0 comments:</strong> Post exists but has no
                comments. This is normal if the post is new or hasn't received engagement.
              </li>
              <li>
                <strong>Comments API failed (404):</strong> Ayrshare couldn't find the post
                ID or platform doesn't support comment API.
              </li>
              <li>
                <strong>Comments API failed (403):</strong> Missing permissions. Check
                Ayrshare dashboard → Profile Settings → ensure comment read permissions
                are granted.
              </li>
              <li>
                <strong>Comments API passed + comments present:</strong> Everything is
                working! Comments should appear in Engagement page.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
