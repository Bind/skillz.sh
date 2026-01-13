import { type FC, useState, useCallback } from "react";
import { Icon } from "./Icon";

interface CopyButtonProps {
  text: string;
  variant?: "icon" | "button";
  className?: string;
}

export const CopyButton: FC<CopyButtonProps> = ({
  text,
  variant = "icon",
  className = "",
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [text]);

  if (variant === "button") {
    return (
      <button
        onClick={handleCopy}
        className={`flex items-center gap-2 px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-700 text-white text-sm font-medium transition-all active:scale-95 ${className}`}
      >
        <Icon name={copied ? "check" : "copy"} size="sm" />
        <span>{copied ? "Copied!" : "Copy"}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className={`p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors ${className}`}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      <Icon name={copied ? "check" : "copy"} size="sm" />
    </button>
  );
};
