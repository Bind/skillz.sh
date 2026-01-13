import { type FC, useState, useCallback } from "react";
import { CopyButton } from "./CopyButton";

interface CodeBlockProps {
  code: string;
  /** "click" = whole block clickable, "hover" = button appears on hover */
  copyMode?: "click" | "hover";
  className?: string;
}

export const CodeBlock: FC<CodeBlockProps> = ({
  code,
  copyMode = "click",
  className = "",
}) => {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [code]);

  if (copyMode === "hover") {
    return (
      <div className={`relative group ${className}`}>
        <pre className="bg-gray-50 text-gray-700 border border-gray-300 rounded-lg p-4 pr-12 overflow-x-auto">
          <code className="text-sm font-mono">{code}</code>
        </pre>
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={code} variant="icon" />
        </div>
      </div>
    );
  }

  // Click mode - whole block is clickable with feedback
  return (
    <div className={`relative group ${className}`}>
      <pre
        onClick={handleClick}
        className="bg-gray-50 text-gray-700 border border-gray-300 rounded-lg p-4 overflow-x-auto cursor-pointer hover:bg-gray-100 transition-colors"
      >
        <code className="text-sm font-mono">{code}</code>
      </pre>
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <span className={`text-xs ${copied ? "text-gray-700" : "text-gray-400"}`}>
          {copied ? "Copied!" : "Click to copy"}
        </span>
      </div>
    </div>
  );
};
