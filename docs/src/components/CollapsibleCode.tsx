import { type FC, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CopyButton } from "./CopyButton";

interface CollapsibleCodeProps {
  filename: string;
  code: string;
  language?: string;
  defaultOpen?: boolean;
}

export const CollapsibleCode: FC<CollapsibleCodeProps> = ({
  filename,
  code,
  language = "typescript",
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <span className="font-mono text-sm text-gray-700">{filename}</span>
        </div>
        <CopyButton text={code} variant="icon" className="opacity-60 hover:opacity-100" />
      </button>
      {isOpen && (
        <div className="bg-gray-900 p-4 overflow-x-auto">
          <pre className="text-sm font-mono text-gray-100 whitespace-pre-wrap">
            <code>{code}</code>
          </pre>
        </div>
      )}
    </div>
  );
};
