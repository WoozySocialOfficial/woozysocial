import { useState } from "react";
import { useToast } from "@chakra-ui/react";
import { baseURL } from "../../utils/constants";

/**
 * LinkShortener - Component for shortening and tracking links
 */
export const LinkShortener = ({ userId, workspaceId, onInsertLink }) => {
  const [urlToShorten, setUrlToShorten] = useState("");
  const [shortenedLink, setShortenedLink] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const handleShortenLink = async () => {
    if (!urlToShorten || !userId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${baseURL}/api/shorten-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlToShorten,
          userId,
          workspaceId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to shorten link");
      }

      setShortenedLink(data);
      toast({
        title: "Link shortened",
        description: "Your trackable link is ready to use",
        status: "success",
        duration: 3000,
        isClosable: true
      });
    } catch (error) {
      console.error("Error shortening link:", error);
      toast({
        title: "Failed to shorten link",
        description: error.message,
        status: "error",
        duration: 4000,
        isClosable: true
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!shortenedLink?.shortLink) return;

    navigator.clipboard.writeText(shortenedLink.shortLink);
    toast({
      title: "Copied to clipboard",
      status: "success",
      duration: 2000,
      isClosable: true
    });
  };

  const handleInsertLink = () => {
    if (shortenedLink?.shortLink && onInsertLink) {
      onInsertLink(shortenedLink.shortLink);
      toast({
        title: "Link inserted",
        status: "success",
        duration: 2000,
        isClosable: true
      });
    }
  };

  return (
    <div className="link-shortener">
      <h4 className="link-shortener-title">Link Shortener & Tracker</h4>

      <div className="link-shortener-input-row">
        <input
          type="url"
          value={urlToShorten}
          onChange={(e) => setUrlToShorten(e.target.value)}
          placeholder="Enter URL to shorten (e.g., https://example.com)"
          className="link-shortener-input"
        />
        <button
          onClick={handleShortenLink}
          disabled={isLoading || !urlToShorten}
          className="link-shortener-btn"
        >
          {isLoading ? "Shortening..." : "Shorten"}
        </button>
      </div>

      {shortenedLink && (
        <div className="link-shortener-result">
          <div className="link-shortener-result-row">
            <input
              type="text"
              value={shortenedLink.shortLink}
              readOnly
              className="link-shortener-result-input"
            />
            <button onClick={handleCopyLink} className="link-shortener-copy-btn">
              Copy
            </button>
            {onInsertLink && (
              <button onClick={handleInsertLink} className="link-shortener-insert-btn">
                Insert
              </button>
            )}
          </div>
          <p className="link-shortener-info">
            This link is trackable. View analytics in the Posts tab after using it.
          </p>
        </div>
      )}
    </div>
  );
};

export default LinkShortener;
